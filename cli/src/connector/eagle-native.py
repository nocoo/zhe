"""Private Eagle attempt supervisor. POSIX only; no overwrite fallback.

Drive IO stays in this killable process group. The outbox lock is on local disk;
flock releases on crashes. Root metadata and mtime indexes are never opened.
"""
import ctypes
import errno
import fcntl
import hashlib
import json
import os
import re
import stat
import subprocess
import sys
import time
import threading
import signal
import uuid

DIR = os.O_RDONLY | os.O_DIRECTORY | os.O_NOFOLLOW
FILE = os.O_RDONLY | os.O_NOFOLLOW | os.O_NONBLOCK
MAX_PENDING = 128
MAX_WORKSPACES = 12  # each original + thumbnail is capped at 20 MiB (240 MiB total)


def read_json(path):
    fd = os.open(path, FILE)
    with os.fdopen(fd, "rb") as file:
        if not stat.S_ISREG(os.fstat(file.fileno()).st_mode):
            raise ValueError("unsafe_file")
        data = file.read(1_048_577)
        if len(data) > 1_048_576:
            raise ValueError("oversized_json")
        return json.loads(data)


def sync_dir(path):
    fd = os.open(path, DIR)
    try:
        os.fsync(fd)
    finally:
        os.close(fd)


def save(path, task):
    temporary = path + "." + uuid.uuid4().hex + ".tmp"
    fd = os.open(temporary, os.O_WRONLY | os.O_CREAT | os.O_EXCL | os.O_NOFOLLOW, 0o600)
    try:
        with os.fdopen(fd, "w") as file:
            json.dump(task, file, ensure_ascii=False, separators=(",", ":"))
            file.flush()
            os.fsync(file.fileno())
        os.replace(temporary, path)
        sync_dir(os.path.dirname(path))
    finally:
        if os.path.exists(temporary):
            os.unlink(temporary)


def receipt(path):
    return os.path.join(os.path.dirname(path), ".done", os.path.basename(path)[:-5])


def compact(path):
    marker = receipt(path)
    os.makedirs(os.path.dirname(marker), mode=0o700, exist_ok=True)
    fd = os.open(marker, os.O_WRONLY | os.O_CREAT | os.O_NOFOLLOW, 0o600)
    os.fsync(fd)
    os.close(fd)
    sync_dir(os.path.dirname(marker))
    for name in (path, path + ".lock"):
        try: os.unlink(name)
        except FileNotFoundError: pass
    sync_dir(os.path.dirname(path))


def remove_work(work):
    fd = os.open(work, DIR)
    try:
        for name in os.listdir(fd):
            os.unlink(name, dir_fd=fd)
    finally:
        os.close(fd)
    os.rmdir(work)


def collect_work(directory_path):
    for name in os.listdir(directory_path):
        if re.fullmatch(r"\.work-[a-f0-9]{64}", name) and (os.path.exists(os.path.join(directory_path, ".done", name[6:])) or os.path.exists(os.path.join(directory_path, name[6:] + ".json.quarantined"))):
            try: remove_work(os.path.join(directory_path, name))
            except OSError: pass  # bounded retained workspace; retry on the next admission


def collect_temps(directory_path):
    # Caller holds enqueue lock; active job saves also hold their per-task flock.
    for name in os.listdir(directory_path):
        match = re.fullmatch(r"([a-f0-9]{64}\.json)\.[a-f0-9]{32}\.tmp", name)
        if not match: continue
        path = os.path.join(directory_path, match[1])
        lock = os.open(path + ".lock", os.O_WRONLY | os.O_CREAT | os.O_NOFOLLOW, 0o600)
        try:
            try: fcntl.flock(lock, fcntl.LOCK_EX | fcntl.LOCK_NB)
            except BlockingIOError: continue
            temporary = os.path.join(directory_path, name)
            if stat.S_ISREG(os.lstat(temporary).st_mode): os.unlink(temporary)
            if not os.path.exists(path): os.unlink(path + ".lock")
        finally:
            os.close(lock)


def maintenance(directory_path):
    if not os.path.isdir(directory_path): return "exists"
    lock = os.open(os.path.join(directory_path, ".enqueue.lock"), os.O_WRONLY | os.O_CREAT | os.O_NOFOLLOW, 0o600)
    try:
        fcntl.flock(lock, fcntl.LOCK_EX)
        collect_temps(directory_path)
        collect_work(directory_path)
        return "exists"
    finally:
        os.close(lock)


def enqueue(directory_path, task):
    os.makedirs(directory_path, mode=0o700, exist_ok=True)
    path = os.path.join(directory_path, task["key"] + ".json")
    validate(task, path)
    lock = os.open(os.path.join(directory_path, ".enqueue.lock"), os.O_WRONLY | os.O_CREAT | os.O_NOFOLLOW, 0o600)
    try:
        fcntl.flock(lock, fcntl.LOCK_EX)
        collect_temps(directory_path)
        collect_work(directory_path)
        if os.path.lexists(path) or os.path.lexists(receipt(path)) or os.path.lexists(path + ".quarantined"):
            return "duplicate"
        names = os.listdir(directory_path)
        if sum(bool(re.fullmatch(r"[a-f0-9]{64}\.json(?:\.quarantined)?", name)) for name in names) >= MAX_PENDING:
            return "quota"
        save(path, task)
        return "queued"
    finally:
        os.close(lock)


def reserve_work(directory_path, work):
    lock = os.open(os.path.join(directory_path, ".quota.lock"), os.O_WRONLY | os.O_CREAT | os.O_NOFOLLOW, 0o600)
    try:
        fcntl.flock(lock, fcntl.LOCK_EX)
        collect_work(directory_path)
        if sum(name.startswith(".work-") for name in os.listdir(directory_path)) >= MAX_WORKSPACES:
            raise RuntimeError("quota")
        os.mkdir(work, mode=0o700)
    finally:
        os.close(lock)


def worker_slot(directory_path):
    # Stable files are never unlinked; locks are released by the kernel on crashes.
    for index in range(4):
        fd = os.open(os.path.join(directory_path, ".worker-" + str(index) + ".lock"), os.O_WRONLY | os.O_CREAT | os.O_NOFOLLOW, 0o600)
        try:
            fcntl.flock(fd, fcntl.LOCK_EX | fcntl.LOCK_NB)
            return fd
        except BlockingIOError:
            os.close(fd)
    raise RuntimeError("workers_busy")


def directory(path):
    """Walk via openat: no symlink in any library path component."""
    if not os.path.isabs(path):
        raise ValueError("relative_path")
    fd = os.open("/", DIR)
    try:
        for part in path.split("/")[1:]:
            if not part or part in (".", ".."):
                raise ValueError("unsafe_path")
            child = os.open(part, DIR, dir_fd=fd)
            os.close(fd)
            fd = child
        return fd
    except BaseException:
        os.close(fd)
        raise


def load_at(parent, name, limit=10 * 1024 * 1024):
    fd = os.open(name, FILE, dir_fd=parent)
    with os.fdopen(fd, "rb") as file:
        info = os.fstat(file.fileno())
        if not stat.S_ISREG(info.st_mode) or info.st_nlink != 1 or info.st_size > limit:
            raise ValueError("unsafe_file")
        data = file.read(limit + 1)
        if len(data) > limit:
            raise ValueError("oversized_file")
        return data


def write_at(parent, name, data):
    fd = os.open(name, os.O_WRONLY | os.O_CREAT | os.O_EXCL | os.O_NOFOLLOW, 0o600, dir_fd=parent)
    with os.fdopen(fd, "wb") as file:
        file.write(data)
        file.flush()
        os.fsync(file.fileno())


def digest(data):
    return hashlib.sha256(data).hexdigest()


def identity(task):
    raw = json.dumps([task["postId"], task["media"]["id"]], separators=(",", ":"))
    fingerprint = digest(raw.encode())
    number = int(fingerprint[:15], 16)
    alphabet = "0123456789ABCDEFGHIJKLMNOPQRSTUVWXYZ"
    encoded = ""
    while number:
        encoded = alphabet[number % 36] + encoded
        number //= 36
    return "Z" + encoded.rjust(12, "0"), fingerprint


def validate(task, path):
    media = task["media"]
    raw = json.dumps([task["libraryPath"], task["postId"], media["id"]], ensure_ascii=False, separators=(",", ":"))
    if (task["version"] != 1 or media["type"] != "PHOTO"
        or not re.fullmatch(r"[0-9]{1,22}", task["postId"])
        or not re.fullmatch(r"[0-9]{1,22}", media["id"])
        or not re.fullmatch(r"[a-zA-Z0-9_]{1,50}", task["username"])
        or not isinstance(task["text"], str) or len(task["text"]) > 100_000
        or not os.path.isabs(task["libraryPath"]) or not task["libraryPath"].endswith(".library")
        or task["key"] != digest(raw.encode())
        or os.path.basename(path) != task["key"] + ".json"
        or not isinstance(task["attempts"], int) or task["attempts"] < 0
        or not isinstance(task["retryMs"], int) or not 1000 <= task["retryMs"] <= 300_000
        or not isinstance(task["timeoutMs"], int) or not 1000 <= task["timeoutMs"] <= 600_000):
        raise ValueError("invalid_task")


def exclusive_rename(parent, source, target):
    libc = ctypes.CDLL(None, use_errno=True)
    if sys.platform == "darwin":
        rename = libc.renameatx_np
        flags = 4 | 0x10  # RENAME_EXCL | RENAME_NOFOLLOW_ANY
    elif sys.platform == "linux":
        rename = libc.renameat2
        flags = 1  # RENAME_NOREPLACE
    else:
        raise ValueError("unsupported_platform")
    rename.argtypes = [ctypes.c_int, ctypes.c_char_p, ctypes.c_int, ctypes.c_char_p, ctypes.c_uint]
    rename.restype = ctypes.c_int
    if rename(parent, source.encode(), parent, target.encode(), flags):
        code = ctypes.get_errno()
        raise OSError(code, "publish_failed")


def quarantine(path):
    name = os.path.basename(path)
    if not re.fullmatch(r"[a-f0-9]{64}\.json", name): raise ValueError("invalid_task")
    parent = os.open(os.path.dirname(path), DIR)
    try:
        try: exclusive_rename(parent, name, name + ".quarantined")
        except OSError as error:
            if error.errno in (errno.EEXIST, errno.ENOTEMPTY): return "quarantine_conflict"
            raise
        os.fsync(parent)
        return "quarantined"
    finally:
        os.close(parent)


def validate_library(path):
    library = directory(path)
    try:
        if not stat.S_ISREG(os.stat("metadata.json", dir_fd=library, follow_symlinks=False).st_mode):
            raise ValueError("invalid_library")
        images = os.open("images", DIR, dir_fd=library)
        os.close(images)
        return "exists"
    finally:
        os.close(library)


def existing(images, item, fingerprint):
    try:
        fd = os.open(item + ".info", DIR, dir_fd=images)
    except FileNotFoundError:
        return False
    except OSError as error:
        if error.errno in (errno.ELOOP, errno.ENOTDIR): raise ValueError("item_collision") from error
        raise
    try:
        try:
            metadata = json.loads(load_at(fd, "metadata.json", 1_048_576))
            if not isinstance(metadata, dict): raise ValueError("item_collision")
        except (ValueError, TypeError) as error:
            raise ValueError("item_collision") from error
        except OSError as error:
            if error.errno in (errno.ENOENT, errno.ELOOP, errno.ENOTDIR): raise ValueError("item_collision") from error
            raise
        # Respect later Eagle edits/deletion. Never repair or overwrite published entries.
        if metadata.get("zheSource") != fingerprint or metadata.get("id") != item:
            raise ValueError("item_collision")
        return True
    finally:
        os.close(fd)


def recover_published(task, path):
    try: images = directory(task["libraryPath"] + "/images")
    except OSError: return False
    try:
        item, fingerprint = identity(task)
        if not existing(images, item, fingerprint): return False
        cleanup_stage(images, task, path)
        return True
    finally:
        os.close(images)


def prepared(work):
    info = read_json(os.path.join(work, "prepared.json"))
    if info["ext"] not in ("jpg", "png", "webp"):
        raise ValueError("invalid_format")
    fd = os.open(work, DIR)
    try:
        original = load_at(fd, "original." + info["ext"])
        thumbnail = load_at(fd, "thumbnail.png")
        if (len(original) != info["size"] or digest(original) != info["sha256"]
            or digest(thumbnail) != info["thumbnailSha256"]
            or not thumbnail.startswith(b"\x89PNG\r\n\x1a\n")
            or not 0 < info["width"] <= 10_000 or not 0 < info["height"] <= 10_000
            or not 0 < info["width"] * info["height"] <= 20_000_000):
            raise ValueError("invalid_prepared")
        return info, original, thumbnail
    finally:
        os.close(fd)


def cleanup_stage(images, task, path):
    stage = task.get("stage")
    prefix = ".zhe-" + task["key"] + "-"
    if stage is None:
        return
    if not re.fullmatch(re.escape(prefix) + r"[a-f0-9]{32}\.stage", stage):
        raise ValueError("invalid_stage")
    try:
        fd = os.open(stage, DIR, dir_fd=images)
    except FileNotFoundError:
        fd = None
    if fd is not None:
        try:
            # Stage is private and contains files only. Never follow or recursively delete links.
            for name in os.listdir(fd):
                os.unlink(name, dir_fd=fd)
        finally:
            os.close(fd)
        os.rmdir(stage, dir_fd=images)
        os.fsync(images)
    task.pop("stage")
    save(path, task)


def publish(task, path, work):
    library = directory(task["libraryPath"])
    images = None
    try:
        marker = os.stat("metadata.json", dir_fd=library, follow_symlinks=False)
        if not stat.S_ISREG(marker.st_mode):
            raise ValueError("invalid_library")
        images = os.open("images", DIR, dir_fd=library)
        item, fingerprint = identity(task)
        cleanup_stage(images, task, path)
        if existing(images, item, fingerprint):
            return "exists"
        info, original, thumbnail = prepared(work)
        name = "X_" + task["username"] + "_" + task["postId"] + "_" + task["media"]["id"]
        now = task["createdAt"]
        metadata = {
            "id": item, "name": name, "size": info["size"], "ext": info["ext"],
            "width": info["width"], "height": info["height"], "btime": now, "mtime": now,
            "modificationTime": now, "lastModified": now, "folders": [], "tags": ["zhe", "X", task["username"]],
            "isDeleted": False, "noThumbnail": False, "palettes": [],
            "url": "https://x.com/" + task["username"] + "/status/" + task["postId"],
            "annotation": task["text"], "zheSource": fingerprint,
        }
        stage = ".zhe-" + task["key"] + "-" + uuid.uuid4().hex + ".stage"
        task["stage"] = stage
        save(path, task)  # recovery intent precedes any Drive staging mutation
        os.mkdir(stage, mode=0o700, dir_fd=images)
        fd = os.open(stage, DIR, dir_fd=images)
        try:
            write_at(fd, name + "." + info["ext"], original)
            write_at(fd, name + "_thumbnail.png", thumbnail)
            write_at(fd, "metadata.json", json.dumps(metadata, ensure_ascii=False, separators=(",", ":")).encode())
            os.fsync(fd)
        finally:
            os.close(fd)
        # Recheck the configured directory binding immediately before publication.
        current = directory(task["libraryPath"] + "/images")
        try:
            a, b = os.fstat(images), os.fstat(current)
            if (a.st_dev, a.st_ino) != (b.st_dev, b.st_ino):
                raise ValueError("library_changed")
        finally:
            os.close(current)
        try:
            exclusive_rename(images, stage, item + ".info")
        except OSError as error:
            if error.errno not in (errno.EEXIST, errno.ENOTEMPTY) or not existing(images, item, fingerprint):
                raise
            cleanup_stage(images, task, path)
            return "exists"
        os.fsync(images)
        task.pop("stage")
        return "saved"
    finally:
        if images is not None:
            os.close(images)
        os.close(library)


def run(path, node, worker, deadline=None):
    if not re.fullmatch(r"[a-f0-9]{64}\.json", os.path.basename(path)):
        raise ValueError("invalid_task")
    if os.path.exists(receipt(path)):
        compact(path)
        return "exists"
    lock = os.open(path + ".lock", os.O_WRONLY | os.O_CREAT | os.O_NOFOLLOW, 0o600)
    slot = None
    try:
        fcntl.flock(lock, fcntl.LOCK_EX | fcntl.LOCK_NB)
        task = read_json(path)
        validate(task, path)
        if task["done"]:
            compact(path)
            return "exists"
        now = int(time.time() * 1000)
        if task["nextAttemptAt"] > now:
            return "retry"
        slot = worker_slot(os.path.dirname(path))
        deadline = deadline or (time.monotonic() + task["timeoutMs"] / 1000)
        task["attempts"] += 1
        backoff = min(300_000, task["retryMs"] * 2 ** min(task["attempts"] - 1, 10))
        task["nextAttemptAt"] = now + task["timeoutMs"] + backoff
        save(path, task)  # preserve backoff even on timeout/SIGKILL
        work = os.path.join(os.path.dirname(path), ".work-" + task["key"])
        phase = "drive_unavailable"
        try:
            # A published directory is authoritative even if a power loss lost local cache.
            if recover_published(task, path):
                compact(path)
                try: remove_work(work)
                except OSError: pass
                return "exists"
            phase = "download_failed"
            try:
                prepared(work)
            except (OSError, ValueError, KeyError, TypeError):
                if os.path.lexists(work):
                    remove_work(work)
                reserve_work(os.path.dirname(path), work)
                remaining = max(1, int((deadline - time.monotonic()) * 1000))
                subprocess.run([node, worker, path, work, str(remaining)], check=True, stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL)
                prepared(work)
            phase = "drive_unavailable"
            result = publish(task, path, work)
            compact(path)
        except BaseException as error:
            task["nextAttemptAt"] = int(time.time() * 1000) + backoff
            task["lastError"] = "conflict" if str(error) == "item_collision" else "quota" if str(error) == "quota" else phase
            save(path, task)
            raise
        try: remove_work(work)
        except OSError: pass  # publication already succeeded; maintenance retries cleanup
        return result
    finally:
        if slot is not None:
            os.close(slot)
        os.close(lock)


if __name__ == "__main__":
    watchdog = None
    try:
        if sys.argv[1] == "--enqueue":
            print(enqueue(sys.argv[2], json.loads(sys.stdin.buffer.read(1_048_576))), flush=True)
        elif sys.argv[1] == "--maintenance":
            print(maintenance(sys.argv[2]), flush=True)
        elif sys.argv[1] == "--quarantine":
            print(quarantine(sys.argv[2]), flush=True)
        elif sys.argv[1] == "--validate-library":
            print(validate_library(sys.argv[2]), flush=True)
        else:
            # Keep a deadline even if the connector parent crashes and loses its timer.
            try:
                timeout = read_json(sys.argv[1]).get("timeoutMs", 180_000)
            except (OSError, ValueError, TypeError):
                timeout = 180_000
            timeout = timeout if isinstance(timeout, int) and 1000 <= timeout <= 600_000 else 180_000
            if len(sys.argv) > 4:
                timeout = max(1, min(timeout, int(sys.argv[4]) - int(time.time() * 1000)))
            deadline = time.monotonic() + timeout / 1000
            def expire():
                if os.getpgrp() == os.getpid():
                    os.killpg(os.getpgrp(), signal.SIGKILL)
                else:
                    os._exit(124)
            watchdog = threading.Timer(timeout / 1000, expire)
            watchdog.daemon = True
            watchdog.start()
            result = run(*sys.argv[1:4], deadline=deadline)
            watchdog.cancel()
            print(result, flush=True)
    except BaseException:
        # No paths, post text, cookies or raw subprocess/provider errors in logs.
        print("retry", flush=True)
        sys.exit(1)
    finally:
        if watchdog is not None:
            watchdog.cancel()

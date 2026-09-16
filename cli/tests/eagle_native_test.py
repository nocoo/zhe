"""Native integration tests use isolated synthetic libraries, never the user's Drive."""
import concurrent.futures
import hashlib
import importlib.util
import json
import os
from pathlib import Path
import shutil
import subprocess
import tempfile
import time
import unittest
from unittest.mock import patch
import zlib
import struct
import signal

SOURCE = Path(__file__).resolve().parents[1] / "src/connector/eagle-native.py"
spec = importlib.util.spec_from_file_location("eagle_native", SOURCE)
native = importlib.util.module_from_spec(spec)
spec.loader.exec_module(native)


def png():
    def chunk(kind, data):
        return struct.pack(">I", len(data)) + kind + data + struct.pack(">I", zlib.crc32(kind + data))
    return b"\x89PNG\r\n\x1a\n" + chunk(b"IHDR", struct.pack(">2I5B", 1, 1, 8, 2, 0, 0, 0)) + chunk(b"IDAT", zlib.compress(b"\0\xff\0\0")) + chunk(b"IEND", b"")


class EagleNativeTests(unittest.TestCase):
    def setUp(self):
        self.root = Path(tempfile.mkdtemp(prefix="zhe-eagle-native-")).resolve()
        self.library = self.root / "Fixture.library"
        self.images = self.library / "images"
        self.images.mkdir(parents=True)
        (self.library / "metadata.json").write_text('{"folders":[]}')
        (self.library / "mtime.json").write_text("ROOT INDEX SENTINEL")
        old = self.images / "OLDTEST.info"
        old.mkdir()
        (old / "metadata.json").write_text("OLD METADATA SENTINEL")
        self.outbox = self.root / "outbox"
        self.outbox.mkdir()
        self.node = shutil.which("node")

    def tearDown(self):
        self.assertEqual((self.library / "metadata.json").read_text(), '{"folders":[]}')
        self.assertEqual((self.library / "mtime.json").read_text(), "ROOT INDEX SENTINEL")
        self.assertEqual((self.images / "OLDTEST.info/metadata.json").read_text(), "OLD METADATA SENTINEL")
        shutil.rmtree(self.root)

    def task(self, media="200", library=None):
        library = str(library or self.library)
        key = native.digest(json.dumps([library, "123", media], separators=(",", ":")).encode())
        task = dict(version=1, key=key, libraryPath=library, postId="123",
                    media=dict(id=media, type="PHOTO", url="https://pbs.twimg.com/media/test.png"),
                    username="fixture", text="合成正文", createdAt=1789500000000,
                    attempts=0, nextAttemptAt=0, done=False, retryMs=1000, timeoutMs=1000)
        path = self.outbox / (key + ".json")
        native.save(str(path), task)
        self.prepare(task)
        return task, path

    def prepare(self, task):
        work = self.outbox / (".work-" + task["key"])
        work.mkdir(exist_ok=True)
        image = png()
        (work / "original.png").write_bytes(image)
        (work / "thumbnail.png").write_bytes(image)
        (work / "prepared.json").write_text(json.dumps(dict(ext="png", size=len(image), sha256=native.digest(image),
            width=1, height=1, thumbnailSha256=native.digest(image))))
        return work

    def execute(self, path):
        return subprocess.run(["python3", str(SOURCE), str(path), self.node, "/no-download-needed.js"], capture_output=True, text=True, timeout=10)

    def retry_now(self, path):
        task = json.loads(path.read_text())
        task["nextAttemptAt"] = 0
        native.save(str(path), task)
        return task

    def test_four_parallel_images_atomic_and_duplicate(self):
        pairs = [self.task(str(200 + i)) for i in range(4)]
        with concurrent.futures.ThreadPoolExecutor() as pool:
            results = list(pool.map(lambda pair: self.execute(pair[1]), pairs))
        self.assertTrue(all(result.stdout.strip() == "saved" for result in results), results)
        self.assertEqual(len(list(self.images.glob("*.info"))), 5)
        for task, path in pairs:
            item, fingerprint = native.identity(task)
            target = self.images / (item + ".info")
            files = sorted(target.iterdir())
            self.assertEqual(len(files), 3)
            meta = json.loads((target / "metadata.json").read_text())
            self.assertFalse(meta["noThumbnail"])
            self.assertEqual(meta["annotation"], "合成正文")
            self.assertEqual(meta["zheSource"], fingerprint)
            self.assertEqual((target / (meta["name"] + ".png")).read_bytes(), png())
            self.assertEqual((target / (meta["name"] + "_thumbnail.png")).read_bytes(), png())
            before = {p.name: (p.read_bytes(), p.stat().st_mtime_ns) for p in files}
            self.assertEqual(self.execute(path).stdout.strip(), "exists")
            self.assertEqual(before, {p.name: (p.read_bytes(), p.stat().st_mtime_ns) for p in files})

    def test_concurrent_processes_share_a_crash_safe_lock(self):
        task, path = self.task()
        with concurrent.futures.ThreadPoolExecutor(max_workers=8) as pool:
            results = list(pool.map(lambda _: self.execute(path), range(8)))
        self.assertEqual(sum(r.stdout.strip() == "saved" for r in results), 1)
        self.assertTrue(all(r.stdout.strip() in ("saved", "exists", "retry") for r in results))
        self.assertTrue(Path(native.receipt(str(path))).exists())
        self.assertEqual(len(list(self.images.glob("*.info"))), 2)

    def test_drive_unavailable_keeps_payload_and_resumes_without_download(self):
        task, path = self.task(library=self.root / "Offline.library")
        self.assertNotEqual(self.execute(path).returncode, 0)
        state = json.loads(path.read_text())
        self.assertEqual(state["attempts"], 1)
        self.assertFalse(state["done"])
        self.assertGreater(state["nextAttemptAt"], time.time() * 1000)
        self.assertTrue((self.outbox / (".work-" + task["key"])).exists())
        unavailable = Path(task["libraryPath"])
        self.assertFalse(unavailable.exists())
        unavailable.mkdir(); (unavailable / "images").mkdir(); (unavailable / "metadata.json").write_text("{}")
        self.retry_now(path)
        self.assertEqual(self.execute(path).stdout.strip(), "saved")

    def test_one_corrupt_photo_leaves_other_three_complete(self):
        pairs = [self.task(str(200 + i)) for i in range(4)]
        work = self.outbox / (".work-" + pairs[1][0]["key"])
        (work / "original.png").write_bytes(b"corrupt")
        results = [self.execute(path).stdout.strip() for _, path in pairs]
        self.assertEqual(results, ["saved", "retry", "saved", "saved"])

    def test_retry_clock_and_attempts_persist(self):
        task, path = self.task(library=self.root / "Offline.library")
        self.execute(path)
        before = path.read_bytes()
        self.assertEqual(self.execute(path).stdout.strip(), "retry")
        self.assertEqual(path.read_bytes(), before)
        self.retry_now(path); self.execute(path)
        self.assertEqual(json.loads(path.read_text())["attempts"], 2)

    def test_crash_before_rename_recovers_partial_stage(self):
        task, path = self.task()
        original = native.write_at
        def crash(parent, name, data):
            original(parent, name, data)
            raise RuntimeError("simulated crash")
        with patch.object(native, "write_at", side_effect=crash):
            with self.assertRaises(RuntimeError):
                native.run(str(path), self.node, "/not-called.js")
        self.assertEqual(len(list(self.images.glob("*.info"))), 1)
        self.assertEqual(len(list(self.images.glob(".zhe-*.stage"))), 1)
        self.retry_now(path)
        self.assertEqual(self.execute(path).stdout.strip(), "saved")
        self.assertEqual(len(list(self.images.glob(".zhe-*.stage"))), 0)

    def test_crash_after_rename_before_receipt_is_idempotent(self):
        task, path = self.task()
        original = native.exclusive_rename
        def crash(*args):
            original(*args)
            raise RuntimeError("simulated crash after publication")
        with patch.object(native, "exclusive_rename", side_effect=crash):
            with self.assertRaises(RuntimeError):
                native.run(str(path), self.node, "/not-called.js")
        self.assertFalse(json.loads(path.read_text())["done"])
        native.remove_work(str(self.outbox / (".work-" + task["key"])))
        self.retry_now(path)
        self.assertEqual(self.execute(path).stdout.strip(), "exists")
        self.assertEqual(len(list(self.images.glob("*.info"))), 2)

    def test_never_overwrites_collision_even_empty_directory(self):
        task, path = self.task()
        item, _ = native.identity(task)
        target = self.images / (item + ".info")
        target.mkdir()
        self.assertNotEqual(self.execute(path).returncode, 0)
        self.assertEqual(list(target.iterdir()), [])
        (target / "metadata.json").write_text('{"zheSource":"someone-else"}')
        self.retry_now(path)
        self.assertNotEqual(self.execute(path).returncode, 0)
        self.assertEqual((target / "metadata.json").read_text(), '{"zheSource":"someone-else"}')

    def test_native_rename_exclusive_even_racing_empty_target(self):
        fd = os.open(str(self.images), native.DIR)
        try:
            (self.images / "stage").mkdir(); (self.images / "target").mkdir()
            with self.assertRaises(OSError):
                native.exclusive_rename(fd, "stage", "target")
            self.assertTrue((self.images / "stage").exists())
        finally:
            os.close(fd)

    def test_symlinks_are_never_followed(self):
        for mode in ("library", "images", "target", "metadata"):
            with self.subTest(mode=mode):
                outside = self.root / (mode + "-outside")
                outside.mkdir()
                if mode == "library":
                    alias = self.root / "Alias.library"; alias.symlink_to(self.library)
                    task, path = self.task("201", alias)
                else:
                    task, path = self.task(str(202 + len(mode)))
                    item, _ = native.identity(task)
                    if mode == "images":
                        library = self.root / "Symlink.library"; library.mkdir()
                        (library / "metadata.json").write_text("{}")
                        (library / "images").symlink_to(outside)
                        task, path = self.task("202", library)
                    elif mode == "target":
                        (self.images / (item + ".info")).symlink_to(outside)
                    else:
                        target = self.images / (item + ".info"); target.mkdir()
                        sentinel = outside / "sentinel"; sentinel.write_text("DO NOT FOLLOW")
                        (target / "metadata.json").symlink_to(sentinel)
                self.assertNotEqual(self.execute(path).returncode, 0)
                self.assertFalse((outside / "metadata.json").exists())

    def test_prepared_cache_hash_and_fifo_validation(self):
        task, _ = self.task()
        work = self.outbox / (".work-" + task["key"])
        (work / "thumbnail.png").write_bytes(b"invalid")
        with self.assertRaises(ValueError): native.prepared(str(work))
        (work / "thumbnail.png").unlink(); os.mkfifo(work / "thumbnail.png")
        with self.assertRaises(ValueError): native.prepared(str(work))

    def test_invalid_task_cannot_redirect_publication(self):
        task, path = self.task()
        task["postId"] = "../../elsewhere"
        native.save(str(path), task)
        self.assertNotEqual(self.execute(path).returncode, 0)
        self.assertEqual(len(list(self.images.iterdir())), 1)

    def test_enqueue_quota_duplicate_and_compacted_receipts(self):
        task, path = self.task()
        path.unlink()
        self.assertEqual(native.enqueue(str(self.outbox), task), "queued")
        self.assertEqual(native.enqueue(str(self.outbox), task), "duplicate")
        with patch.object(native, "MAX_PENDING", 1):
            second, second_path = self.task("201"); second_path.unlink()
            self.assertEqual(native.enqueue(str(self.outbox), second), "quota")
        self.assertEqual(self.execute(path).stdout.strip(), "saved")
        self.assertFalse(path.exists())
        self.assertFalse(Path(str(path) + ".lock").exists())
        marker = Path(native.receipt(str(path)))
        self.assertEqual(marker.stat().st_size, 0)
        self.assertEqual(native.enqueue(str(self.outbox), task), "duplicate")

    def test_cross_process_global_slots_and_cache_quota(self):
        slots = [native.worker_slot(str(self.outbox)) for _ in range(4)]
        try:
            with self.assertRaisesRegex(RuntimeError, "workers_busy"):
                native.worker_slot(str(self.outbox))
            task, path = self.task()
            result = self.execute(path)
            self.assertEqual(result.stdout.strip(), "retry")
            self.assertEqual(json.loads(path.read_text())["attempts"], 0)
        finally:
            for fd in slots: os.close(fd)
        with patch.object(native, "MAX_WORKSPACES", 1):
            with self.assertRaisesRegex(RuntimeError, "quota"):
                native.reserve_work(str(self.outbox), str(self.outbox / ".work-new"))

    def test_killed_process_group_releases_lock_and_preserves_retry(self):
        task, path = self.task()
        native.remove_work(str(self.outbox / (".work-" + task["key"])))
        worker = self.root / "blocked-worker.cjs"
        marker = self.root / "child-alive"
        worker.write_text("const fs=require('fs');fs.writeFileSync(process.argv[3]+'/started','yes');const cp=require('child_process');cp.spawn(process.execPath,['-e'," + json.dumps("setTimeout(()=>require('fs').writeFileSync(" + json.dumps(str(marker)) + ",'alive'),1000)") + "]);setTimeout(()=>{},60000);")
        process = subprocess.Popen(["python3", str(SOURCE), str(path), self.node, str(worker)], stdout=subprocess.PIPE, stderr=subprocess.PIPE, start_new_session=True)
        try:
            started = self.outbox / (".work-" + task["key"]) / "started"
            until = time.monotonic() + 5
            while not started.exists() and time.monotonic() < until: time.sleep(.02)
            self.assertTrue(started.exists())
            os.killpg(process.pid, signal.SIGKILL)
            process.communicate(timeout=5)
            self.assertGreater(json.loads(path.read_text())["nextAttemptAt"], time.time() * 1000)
            time.sleep(1.1)
            self.assertFalse(marker.exists())
            self.retry_now(path); self.prepare(task)
            self.assertEqual(self.execute(path).stdout.strip(), "saved")
        finally:
            if process.poll() is None: os.killpg(process.pid, signal.SIGKILL); process.communicate(timeout=5)

    def test_success_remains_success_when_cache_cleanup_fails(self):
        task, path = self.task()
        with patch.object(native, "remove_work", side_effect=OSError("cleanup unavailable")):
            self.assertEqual(native.run(str(path), self.node, "/not-needed.js"), "saved")
        self.assertTrue(Path(native.receipt(str(path))).exists())
        native.collect_work(str(self.outbox))
        self.assertFalse((self.outbox / (".work-" + task["key"])).exists())

    def test_kill_during_save_is_cleaned_without_touching_active_saves(self):
        task, path = self.task()
        before = path.read_bytes()
        marker = self.root / "saving"
        script = """
import importlib.util,sys,time,os,fcntl
spec=importlib.util.spec_from_file_location('native',sys.argv[1]); m=importlib.util.module_from_spec(spec); spec.loader.exec_module(m)
path=sys.argv[2]; lock=os.open(path+'.lock',os.O_WRONLY|os.O_CREAT,0o600); fcntl.flock(lock,fcntl.LOCK_EX)
def block(*args):
    open(sys.argv[3],'w').write('ready')
    time.sleep(60)
m.os.replace=block
m.save(path,m.read_json(path))
"""
        process = subprocess.Popen(["python3", "-c", script, str(SOURCE), str(path), str(marker)], start_new_session=True)
        try:
            until = time.monotonic() + 5
            while not marker.exists() and time.monotonic() < until: time.sleep(.02)
            self.assertTrue(marker.exists())
            native.maintenance(str(self.outbox))
            self.assertEqual(len(list(self.outbox.glob("*.tmp"))), 1)
            os.killpg(process.pid, signal.SIGKILL); process.wait(timeout=5)
            native.maintenance(str(self.outbox))
            self.assertEqual(list(self.outbox.glob("*.tmp")), [])
            self.assertEqual(path.read_bytes(), before)
        finally:
            if process.poll() is None: os.killpg(process.pid, signal.SIGKILL); process.wait(timeout=5)

    def test_watchdog_bounds_worker_even_without_parent_timer(self):
        task, path = self.task()
        native.remove_work(str(self.outbox / (".work-" + task["key"])))
        worker = self.root / "never-finishes.cjs"
        worker.write_text("setTimeout(()=>{},60000)")
        started = time.monotonic()
        result = subprocess.run(["python3", str(SOURCE), str(path), self.node, str(worker)], start_new_session=True, capture_output=True, timeout=5)
        self.assertLess(time.monotonic() - started, 4)
        self.assertEqual(result.returncode, -signal.SIGKILL)
        self.assertFalse(json.loads(path.read_text())["done"])


if __name__ == "__main__":
    unittest.main()

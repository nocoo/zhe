"use client";

import { Dialog, DialogContent, DialogDescription } from "@nocoo/basalt/components/dialog";
import { type RefObject, useCallback, useEffect, useMemo, useRef, useState } from "react";
import { CARD_MOTION_EASING, canAnimate, destroyCard } from "@/lib/motion";
import type { EditLinkCallbacks } from "@/viewmodels/useLinksViewModel";
import { InlineEditArea, type InlineEditAreaProps } from "./inline-edit-area";

const FLIGHT_DURATION = 600;
const RETURN_DURATION = 460;
const EDIT_TRIGGER_SELECTOR =
  '[aria-label="Edit link"], [aria-label="更多收藏操作"], [aria-label="编辑 GitHub 收藏"]';
const FALLBACK_FOCUS_SELECTOR =
  '[aria-label="刷新链接"], [aria-label="筛选与视图"], [aria-label="搜索 GitHub 收藏"], [aria-label="搜索 X 收藏"]';

/** A non-interactive copy preserves the exact Grid/List face without mounting another card. */
function prepareFront(source: HTMLElement, front: HTMLElement, frame: HTMLElement) {
  const origin = source.getBoundingClientRect();
  const destination = frame.getBoundingClientRect();
  const copy = source.cloneNode(true) as HTMLElement;
  for (const node of [copy, ...copy.querySelectorAll("[id], [data-testid], [data-link-id]")]) {
    node.removeAttribute("id");
    node.removeAttribute("data-testid");
    node.removeAttribute("data-link-id");
  }
  for (const video of copy.querySelectorAll("video")) {
    video.autoplay = false;
    video.preload = "none";
  }
  for (const control of copy.querySelectorAll<HTMLElement>(
    "a, button, input, select, textarea, video, audio, [tabindex]",
  ))
    control.tabIndex = -1;
  const width = origin.width || destination.width || 1;
  const height = origin.height || destination.height || 1;
  Object.assign(copy.style, {
    width: `${width}px`,
    height: `${height}px`,
    visibility: "visible",
    margin: "0",
    backgroundColor: getComputedStyle(source).backgroundColor,
    transformOrigin: "top left",
    transform: `scale(${destination.width / width || 1}, ${destination.height / height || 1})`,
  });
  front.replaceChildren(copy);
  const x = origin.left + origin.width / 2 - destination.left - destination.width / 2;
  const y = origin.top + origin.height / 2 - destination.top - destination.height / 2;
  return `translate3d(${x}px, ${y}px, 0) rotateY(0deg) scale(${width / (destination.width || width)}, ${height / (destination.height || height)})`;
}

interface CardEditDialogProps extends Omit<InlineEditAreaProps, "defaultEditing" | "onCloseEdit"> {
  source: RefObject<HTMLDivElement | null>;
  trigger: RefObject<HTMLElement | null>;
  animated?: boolean;
  deleted: boolean;
  onClose: () => void;
  onDeleted: () => void;
}

export function CardEditDialog({
  source,
  trigger,
  animated = true,
  deleted,
  onClose,
  onDeleted,
  editCallbacks,
  tags,
  linkTags,
  ...editProps
}: CardEditDialogProps) {
  const panel = useRef<HTMLDivElement | null>(null);
  const flight = useRef<HTMLDivElement | null>(null);
  const front = useRef<HTMLDivElement | null>(null);
  const back = useRef<HTMLDivElement | null>(null);
  const backdrop = useRef<HTMLElement | null>(null);
  const animations = useRef<Animation[]>([]);
  const opening = useRef<Promise<unknown>>(Promise.resolve());
  const closing = useRef(false);
  const restoreFocus = useRef<HTMLElement | null>(trigger.current);
  const pendingUpdates = useRef<(() => void)[]>([]);
  const flushed = useRef(false);
  const [editorTags, setEditorTags] = useState(tags);
  const [editorLinkTags, setEditorLinkTags] = useState(linkTags);

  // Folder/tag changes can remove this card from a filtered list. Publish them
  // after landing; callbacks arriving after close (e.g. tag rollback) still apply.
  const flushUpdates = useCallback(() => {
    flushed.current = true;
    for (const update of pendingUpdates.current.splice(0)) update();
  }, []);
  const callbacks: EditLinkCallbacks = useMemo(() => {
    const defer = (update: () => void) => {
      if (flushed.current) update();
      else pendingUpdates.current.push(update);
    };
    return {
      onLinkUpdated: (link) => defer(() => editCallbacks.onLinkUpdated(link)),
      onTagCreated: (tag) => {
        if (!flushed.current) setEditorTags((current) => [...current, tag]);
        defer(() => editCallbacks.onTagCreated(tag));
      },
      onLinkTagAdded: (linkTag) => {
        if (!flushed.current) setEditorLinkTags((current) => [...current, linkTag]);
        defer(() => editCallbacks.onLinkTagAdded(linkTag));
      },
      onLinkTagRemoved: (linkId, tagId) => {
        if (!flushed.current)
          setEditorLinkTags((current) =>
            current.filter((tag) => tag.linkId !== linkId || tag.tagId !== tagId),
          );
        defer(() => editCallbacks.onLinkTagRemoved(linkId, tagId));
      },
    };
  }, [editCallbacks]);

  const animate = useCallback((element: HTMLElement, keyframes: Keyframe[], duration: number) => {
    if (!canAnimate(element)) return Promise.resolve();
    const animation = element.animate(keyframes, {
      duration,
      easing: CARD_MOTION_EASING,
      fill: "forwards",
    });
    animations.current.push(animation);
    return animation.finished.catch(() => {}).finally(() => animation.cancel());
  }, []);

  const mountPanel = useCallback(
    (node: HTMLDivElement | null) => {
      if (!node || !source.current || !flight.current || !front.current || !back.current) return;
      const card = source.current;
      const face = back.current;
      const frame = flight.current;
      const visibility = card.style.visibility;
      let mounted = true;
      let resolveOpening = () => {};
      panel.current = node;
      closing.current = false;
      flushed.current = false;
      // Basalt's DialogContent portals its overlay immediately before its panel.
      const overlay = node.previousElementSibling;
      backdrop.current = overlay instanceof HTMLElement ? overlay : null;
      node.dataset.phase = "opening";
      face.inert = true;
      if (animated && backdrop.current) {
        backdrop.current.dataset.cardBackdrop = "";
        backdrop.current.style.opacity = "0";
      }
      opening.current = new Promise<void>((resolve) => {
        resolveOpening = resolve;
      });
      const ready = () => {
        if (mounted && !closing.current) {
          node.dataset.phase = "editing";
          face.inert = false;
          const focus = window.matchMedia("(pointer: coarse)").matches
            ? node
            : (face.querySelector<HTMLInputElement>("input") ?? node);
          focus.focus({ preventScroll: true });
        }
        resolveOpening();
      };
      // Radix Select removes its native form control after the first commit.
      // Measure after that layout settles so the flight starts exactly on the card.
      const frameId = requestAnimationFrame(() => {
        if (!animated) return ready();
        if (!front.current) return resolveOpening();
        const origin = prepareFront(card, front.current, frame);
        card.style.visibility = "hidden";
        frame.style.visibility = "visible";
        if (backdrop.current) {
          backdrop.current.style.opacity = "1";
          void animate(backdrop.current, [{ opacity: 0 }, { opacity: 1 }], FLIGHT_DURATION);
        }
        void animate(
          frame,
          [
            { transform: origin },
            { transform: "translate3d(0, 0, 0) rotateY(180deg) scale(1, 1)" },
          ],
          FLIGHT_DURATION,
        ).then(ready);
      });
      return () => {
        mounted = false;
        cancelAnimationFrame(frameId);
        resolveOpening();
        panel.current = null;
        card.style.visibility = visibility;
        for (const animation of animations.current.splice(0)) animation.cancel();
        flushUpdates();
      };
    },
    [source, animated, animate, flushUpdates],
  );

  const finish = useCallback(
    async (action: "close" | "save" | "delete" = "close") => {
      if (closing.current) return;
      if (
        action === "close" &&
        (editProps.isDeleting || panel.current?.querySelector('[aria-busy="true"]'))
      )
        return;
      const destroy = action === "delete";
      closing.current = true;
      await opening.current;
      const node = panel.current;
      const card = source.current;
      const frame = flight.current;
      if (!node || !card || !frame || !front.current || !back.current) return;
      back.current.inert = true;
      if (animated) {
        node.dataset.phase = "returning";
        const origin = prepareFront(card, front.current, frame);
        if (backdrop.current) {
          backdrop.current.style.opacity = "0";
          void animate(backdrop.current, [{ opacity: 1 }, { opacity: 0 }], RETURN_DURATION);
        }
        await animate(
          frame,
          [
            { transform: "translate3d(0, 0, 0) rotateY(180deg) scale(1, 1)" },
            { transform: origin },
          ],
          RETURN_DURATION,
        );
      }
      if (!panel.current) return;
      card.style.visibility = "visible";
      frame.style.visibility = "hidden";
      if (destroy) {
        node.dataset.phase = "destroying";
        node.style.visibility = "hidden";
        if (backdrop.current) backdrop.current.style.opacity = "0";
        const cards = [...document.querySelectorAll<HTMLElement>("[data-link-id]")];
        const index = cards.indexOf(card);
        restoreFocus.current =
          (cards[index + 1] ?? cards[index - 1])?.querySelector<HTMLElement>(
            EDIT_TRIGGER_SELECTOR,
          ) ?? document.querySelector<HTMLElement>(FALLBACK_FOCUS_SELECTOR);
        await destroyCard(card);
        if (!panel.current) return;
      }
      flushUpdates();
      if (destroy) onDeleted();
      else onClose();
    },
    [source, animated, editProps.isDeleting, animate, flushUpdates, onDeleted, onClose],
  );

  useEffect(() => {
    if (deleted) void finish("delete");
  }, [deleted, finish]);

  return (
    <Dialog open onOpenChange={(open) => !open && void finish()}>
      <DialogContent
        ref={mountPanel}
        size="lg"
        className={animated ? "link-card-editor" : "max-h-[90dvh] overflow-y-auto p-0"}
        data-testid="card-edit-dialog"
        onOpenAutoFocus={(event) => event.preventDefault()}
        onCloseAutoFocus={(event) => {
          event.preventDefault();
          const target = restoreFocus.current?.isConnected
            ? restoreFocus.current
            : (source.current?.querySelector<HTMLElement>(EDIT_TRIGGER_SELECTOR) ??
              document.querySelector<HTMLElement>(FALLBACK_FOCUS_SELECTOR));
          target?.focus({ preventScroll: true });
        }}
      >
        <DialogDescription className="sr-only">编辑链接、文件夹、备注和标签</DialogDescription>
        <div ref={flight} className={animated ? "link-card-flight" : undefined}>
          <div
            ref={front}
            className="link-card-front"
            hidden={!animated}
            aria-hidden="true"
            inert
          />
          <div ref={back} className={animated ? "link-card-back" : undefined}>
            <InlineEditArea
              {...editProps}
              tags={editorTags}
              linkTags={editorLinkTags}
              editCallbacks={callbacks}
              isDeleting={editProps.isDeleting || deleted}
              defaultEditing={false}
              modal
              onCloseEdit={() => void finish()}
              onSaved={() => void finish("save")}
            />
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}

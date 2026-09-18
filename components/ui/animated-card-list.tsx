"use client";

import { Children, Component, type ComponentPropsWithoutRef, createRef } from "react";
import { CARD_MOTION_EASING, canAnimate } from "@/lib/motion";
import { cn } from "@/lib/utils";

type Props = ComponentPropsWithoutRef<"div"> & { itemClassName?: string; masonry?: boolean };
type Positions = Map<HTMLElement, DOMRect>;

/** Snapshot before React removes a card, then slide the survivors into place. */
export class AnimatedCardList extends Component<Props, unknown, Positions | null> {
  private container = createRef<HTMLDivElement>();
  private animations = new Set<Animation>();
  private resizeObserver: ResizeObserver | undefined;

  /** Keep DOM/date order while packing cards into the next available grid slot. */
  private layoutMasonry = () => {
    const container = this.container.current;
    if (!container || !this.props.masonry) return;
    const gap = Number.parseFloat(getComputedStyle(container).columnGap) || 0;
    const sizes = Array.from(container.children, (child) => {
      const card = (child.firstElementChild ?? child) as HTMLElement;
      return { item: child as HTMLElement, span: Math.ceil(card.offsetHeight + gap) };
    });
    for (const { item, span } of sizes) item.style.gridRowEnd = `span ${Math.max(1, span)}`;
  };

  private observeMasonry() {
    this.resizeObserver?.disconnect();
    if (!this.props.masonry) return;
    this.resizeObserver ??= new ResizeObserver(this.layoutMasonry);
    for (const child of this.container.current?.children ?? []) {
      this.resizeObserver.observe(child.firstElementChild ?? child);
    }
    this.layoutMasonry();
  }

  componentDidMount() {
    this.observeMasonry();
  }

  private measure(): Positions {
    return new Map(
      Array.from(this.container.current?.children ?? [], (child) => [
        child as HTMLElement,
        // Include the existing entrance animation without replacing its transform.
        (child.firstElementChild ?? child).getBoundingClientRect(),
      ]),
    );
  }

  getSnapshotBeforeUpdate(previous: Props): Positions | null {
    if (
      previous.className !== this.props.className ||
      !this.container.current ||
      !canAnimate(this.container.current)
    )
      return null;
    // A snapshot also includes any ongoing movement, so a second update doesn't jump.
    return this.measure();
  }

  componentDidUpdate(_previous: Props, _state: unknown, snapshot: Positions | null) {
    this.stopAnimations();
    this.observeMasonry();
    if (!snapshot) return;
    // Finish all layout reads before starting animations on the independent wrappers.
    for (const [element, destination] of this.measure()) {
      const origin = snapshot.get(element);
      if (!origin) continue;
      const x = origin.left - destination.left;
      const y = origin.top - destination.top;
      if (Math.abs(x) < 0.5 && Math.abs(y) < 0.5) continue;
      const animation = element.animate(
        [{ transform: `translate(${x}px, ${y}px)` }, { transform: "translate(0, 0)" }],
        { duration: 400, easing: CARD_MOTION_EASING, fill: "both" },
      );
      animation.id = "card-reflow";
      this.animations.add(animation);
      void animation.finished
        .catch(() => {})
        .finally(() => {
          animation.cancel();
          this.animations.delete(animation);
        });
    }
  }

  private stopAnimations() {
    for (const animation of this.animations) animation.cancel();
    this.animations.clear();
  }

  componentWillUnmount() {
    this.resizeObserver?.disconnect();
    this.stopAnimations();
  }

  render() {
    const { children, itemClassName, className, masonry, ...props } = this.props;
    return (
      <div
        {...props}
        ref={this.container}
        className={cn(className, masonry && "auto-rows-[1px] items-start gap-y-0")}
      >
        {Children.map(children, (child) => (
          <div className={cn("min-w-0", itemClassName)} data-card-layout-item="">
            {child}
          </div>
        ))}
      </div>
    );
  }
}

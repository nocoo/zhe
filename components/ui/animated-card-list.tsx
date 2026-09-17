"use client";

import { Children, Component, type ComponentPropsWithoutRef, createRef } from "react";
import { CARD_MOTION_EASING, canAnimate } from "@/lib/motion";
import { cn } from "@/lib/utils";

type Props = ComponentPropsWithoutRef<"div"> & { itemClassName?: string };
type Positions = Map<HTMLElement, DOMRect>;

/** Snapshot before React removes a card, then slide the survivors into place. */
export class AnimatedCardList extends Component<Props, unknown, Positions | null> {
  private container = createRef<HTMLDivElement>();
  private animations = new Set<Animation>();

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
    this.stopAnimations();
  }

  render() {
    const { children, itemClassName, ...props } = this.props;
    return (
      <div {...props} ref={this.container}>
        {Children.map(children, (child) => (
          <div className={cn("min-w-0", itemClassName)} data-card-layout-item="">
            {child}
          </div>
        ))}
      </div>
    );
  }
}

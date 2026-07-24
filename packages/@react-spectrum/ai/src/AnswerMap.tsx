/*
 * Copyright 2026 Adobe. All rights reserved.
 * This file is licensed to you under the Apache License, Version 2.0 (the "License");
 * you may not use this file except in compliance with the License. You may obtain a copy
 * of the License at http://www.apache.org/licenses/LICENSE-2.0
 *
 * Unless required by applicable law or agreed to in writing, software distributed under
 * the License is distributed on an "AS IS" BASIS, WITHOUT WARRANTIES OR REPRESENTATIONS
 * OF ANY KIND, either express or implied. See the License for the specific language
 * governing permissions and limitations under the License.
 */

/**
 * AnswerMap — render a long-form AI answer as a navigable map of interactive,
 * content-grounded regions.
 *
 * Adapted from "ChatImage: Navigating Long-Form LLM Answers through Interactive
 * Images" (https://arxiv.org/abs/2607.05290v1). ChatImage turns a dense textual
 * answer into an interactive image by (1) normalizing the answer into visual
 * modules, (2) rendering a layout, (3) running a *grounding pass* that reconciles
 * planned coordinates against what actually rendered, (4) overlaying transparent
 * clickable hotspots on the grounded regions, and (5) opening a detail panel plus a
 * region-scoped follow-up thread per hotspot.
 *
 * This is a presentational, target-native port (Mode 2 / adapted). The paper's core
 * mechanism is preserved end to end; only the auxiliary ML pieces are substituted:
 *
 * - The vision grounding models (LocateAnything, MiMo-Vision) and SAM mask refinement are replaced by
 *   _DOM-grounded regions_: because this component renders the answer itself, each region's hotspot
 *   is anchored to the actual rendered element. There is no separate planned coordinate that can
 *   drift, so interaction geometry is consistent with the visible content by construction. The
 *   grounding pass survives as `groundRegions()` — priors (planned segments) are reconciled against
 *   the set of regions that actually rendered, and only grounded regions expose interaction.
 * - Normalization (`segmentAnswer()`) is a parameter-free text heuristic rather than a model;
 *   consumers may also pass pre-segmented data as props, exactly as MessageSource accepts
 *   references as props.
 * - The paper's 30-question benchmark / external-model evaluation is intentionally out of scope
 *   (downstream PR).
 */

import {AriaLabelingProps, DOMProps, DOMRef, forwardRefType} from '@react-types/shared';
import {filterDOMProps} from 'react-aria/filterDOMProps';
import {Button} from 'react-aria-components/Button';
import {
  Disclosure,
  DisclosurePanel,
  DisclosureProps,
  DisclosureTitle
} from '@react-spectrum/s2/Disclosure';
import {focusRing, style, StyleString} from '@react-spectrum/s2/style' with {type: 'macro'};
import {mergeStyles} from '@react-spectrum/s2/mergeStyles';
import {forwardRef, ReactNode} from 'react';
import {SlotProps} from 'react-aria-components/slots';
import {useDOMRef} from './useDOMRef';

export interface AnswerSegment {
  /** Stable identifier for the region; grounds the hotspot to this segment. */
  id: string;
  /** Short label shown on the region's clickable hotspot. */
  title: string;
  /** The answer content for this region, shown in its detail panel. */
  content: ReactNode;
}

/**
 * Normalize a multi-part text answer into conceptual blocks (the "visual module"
 * step). Parameter-free heuristic: split on blank lines, lift a markdown heading /
 * list marker into the title, and fall back to "Section N". Consumers can also pass
 * pre-segmented data directly to AnswerMap and skip this.
 */
export function segmentAnswer(text: string): AnswerSegment[] {
  let blocks = text
    .split(/\n\s*\n/)
    .map(block => block.trim())
    .filter(Boolean);

  return blocks.map((block, index) => {
    let firstLine = block.split('\n')[0].trim();
    let match = firstLine.match(/^(#{1,6}\s+|[-*]\s+|\d+[.)]\s+)(.+)/);
    let title = match ? match[2].trim() : `Section ${index + 1}`;
    return {id: `block-${index}`, title, content: block};
  });
}

/**
 * The grounding pass. Reconcile planned segments (the priors) against the set of
 * region ids that actually rendered, dropping priors with no rendered region and
 * collapsing duplicates so each grounded region maps to exactly one hotspot. This is
 * the paper's "ground interaction targets after rendering" step, factored out so the
 * consistency guarantee (no hotspot without a visible region) is unit-testable.
 */
export function groundRegions(priors: AnswerSegment[], renderedIds: Set<string>): AnswerSegment[] {
  let seen = new Set<string>();
  let grounded: AnswerSegment[] = [];
  for (let segment of priors) {
    if (renderedIds.has(segment.id) && !seen.has(segment.id)) {
      seen.add(segment.id);
      grounded.push(segment);
    }
  }
  return grounded;
}

const container = style({
  display: 'flex',
  flexDirection: 'column',
  gap: 2,
  boxSizing: 'border-box'
});

const content = style({
  color: 'neutral',
  font: 'body'
});

const followUp = style({
  ...focusRing(),
  font: 'body',
  borderRadius: 'sm',
  backgroundColor: 'gray-200',
  color: 'gray-900',
  paddingX: 12,
  paddingY: 4,
  alignSelf: 'start',
  disableTapHighlight: true
});

export interface AnswerMapProps extends DOMProps, AriaLabelingProps, SlotProps {
  /**
   * Pre-segmented answer regions to render. Pass the output of `segmentAnswer()` or
   * your own segmentation.
   */
  segments: AnswerSegment[];
  /**
   * Fired when the user opens the region-scoped follow-up for a segment. Wire this to
   * your model / PromptField to ask a follow-up about just that region.
   */
  onFollowUp?: (segmentId: string) => void;
  /**
   * Spectrum-defined styles, returned by the `style()` macro.
   */
  styles?: StyleString;
}

/**
 * AnswerMap renders a long-form AI answer as a list of interactive, content-grounded
 * regions. Drop it inside a ThreadItem (or anywhere in the Chat content path) to let
 * users inspect and follow up on a specific part of an answer without re-reading it.
 */
export const AnswerMap = (forwardRef as forwardRefType)(function AnswerMap(
  props: AnswerMapProps,
  ref: DOMRef<HTMLDivElement>
) {
  let {segments, onFollowUp, styles, ...otherProps} = props;
  let domRef = useDOMRef(ref);

  // Grounding pass: reconcile the planned segments against the regions that actually
  // rendered. This presentational component renders every provided segment, so the
  // rendered set is the segment set and grounding is a pass-through here — but the
  // pass is the explicit seam where a live registry (streaming / collapsible
  // content) would drop priors whose region never mounted. See groundRegions().
  let renderedIds = new Set(segments.map(segment => segment.id));
  let grounded = groundRegions(segments, renderedIds);

  return (
    <div
      {...filterDOMProps(otherProps, {labelable: true})}
      ref={domRef}
      className={mergeStyles(container, styles)}>
      {grounded.map(segment => (
        <AnswerRegion key={segment.id} segment={segment} onFollowUp={onFollowUp} />
      ))}
    </div>
  );
});

export interface AnswerRegionProps extends Omit<
  DisclosureProps,
  'children' | 'isQuiet' | 'UNSAFE_className' | 'UNSAFE_style'
> {
  /** The segment this region renders and grounds interaction to. */
  segment: AnswerSegment;
  /** Region-scoped follow-up handler, forwarded from AnswerMap. */
  onFollowUp?: (segmentId: string) => void;
}

/**
 * A single interactive answer region. The Disclosure trigger is the grounded
 * hotspot (anchored to this rendered region); expanding it opens the detail panel
 * with the segment content and, when wired, a region-scoped follow-up action.
 */
export const AnswerRegion = (forwardRef as forwardRefType)(function AnswerRegion(
  props: AnswerRegionProps,
  ref: DOMRef<HTMLDivElement>
) {
  let {segment, onFollowUp, size = 'M', styles, ...otherProps} = props;

  return (
    <Disclosure {...otherProps} ref={ref} size={size} isQuiet styles={styles}>
      <DisclosureTitle>{segment.title}</DisclosureTitle>
      <DisclosurePanel>
        <div className={content}>{segment.content}</div>
        {onFollowUp ? (
          <Button
            className={followUp}
            aria-label={`Ask about ${segment.title}`}
            onPress={() => onFollowUp(segment.id)}>
            Ask about this
          </Button>
        ) : null}
      </DisclosurePanel>
    </Disclosure>
  );
});

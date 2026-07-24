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

import {AnswerMap, groundRegions, segmentAnswer} from '@react-spectrum/ai';
import {pointerMap, render} from '@react-spectrum/test-utils-internal';
import React from 'react';
import userEvent from '@testing-library/user-event';

// Conditionally skip the suite on React < 19, matching the package's other tests.
const describeOrSkip = parseInt(React.version, 10) < 19 ? describe.skip : describe;

describe('groundRegions (ChatImage grounding pass)', () => {
  it('keeps priors whose region rendered', () => {
    let priors = [
      {id: 'a', title: 'A', content: 'aa'},
      {id: 'b', title: 'B', content: 'bb'},
      {id: 'c', title: 'C', content: 'cc'}
    ];
    let grounded = groundRegions(priors, new Set(['a', 'c']));
    expect(grounded.map(s => s.id)).toEqual(['a', 'c']);
  });

  it('drops priors with no rendered region and collapses duplicate ids', () => {
    let priors = [
      {id: 'a', title: 'A', content: 'aa'},
      {id: 'a', title: 'A2', content: 'aa2'},
      {id: 'b', title: 'B', content: 'bb'}
    ];
    let grounded = groundRegions(priors, new Set(['a', 'b']));
    expect(grounded.map(s => s.id)).toEqual(['a', 'b']);
    expect(grounded.map(s => s.title)).toEqual(['A', 'B']);
  });
});

describe('segmentAnswer (normalization)', () => {
  it('splits a multi-part answer into grounded segments', () => {
    let segments = segmentAnswer('## Step one\ndo a thing\n\n## Step two\ndo another');
    expect(segments).toHaveLength(2);
    expect(segments[0]).toMatchObject({id: 'block-0', title: 'Step one'});
    expect(segments[1]).toMatchObject({id: 'block-1', title: 'Step two'});
  });

  it('falls back to a numbered section title when there is no heading', () => {
    let segments = segmentAnswer('just some text\n\nmore text');
    expect(segments.map(s => s.title)).toEqual(['Section 1', 'Section 2']);
  });
});

describeOrSkip('AnswerMap', () => {
  let user;
  beforeAll(() => {
    user = userEvent.setup({delay: null, pointerMap});
  });

  it('renders one interactive region per grounded segment', () => {
    let {getByRole, queryByRole} = render(
      <AnswerMap
        aria-label="Answer"
        segments={[
          {id: 'a', title: 'Overview', content: 'High level summary'},
          {id: 'b', title: 'Details', content: 'The gritty bits'}
        ]}
      />
    );

    expect(getByRole('button', {name: 'Overview'})).toBeInTheDocument();
    expect(getByRole('button', {name: 'Details'})).toBeInTheDocument();
    // No follow-up button is rendered when onFollowUp is not wired.
    expect(queryByRole('button', {name: /Ask about/})).not.toBeInTheDocument();
  });

  it('opens a region-scoped detail panel on click', async () => {
    let {getByRole, getByText} = render(
      <AnswerMap
        aria-label="Answer"
        segments={[{id: 'a', title: 'Overview', content: 'High level summary'}]}
      />
    );

    let trigger = getByRole('button', {name: 'Overview'});
    // Collapsed: the region's hotspot is closed.
    expect(trigger).toHaveAttribute('aria-expanded', 'false');

    await user.click(trigger);
    // The region-scoped detail panel is now open.
    expect(trigger).toHaveAttribute('aria-expanded', 'true');
    expect(getByText('High level summary')).toBeInTheDocument();
  });

  it('fires a region-scoped follow-up from the grounded hotspot', async () => {
    let onFollowUp = jest.fn();
    let {getByRole} = render(
      <AnswerMap
        aria-label="Answer"
        segments={[
          {id: 'a', title: 'Overview', content: 'High level summary'},
          {id: 'b', title: 'Details', content: 'The gritty bits'}
        ]}
        onFollowUp={onFollowUp}
      />
    );

    await user.click(getByRole('button', {name: 'Details'}));
    await user.click(getByRole('button', {name: 'Ask about Details'}));
    expect(onFollowUp).toHaveBeenLastCalledWith('b');

    await user.click(getByRole('button', {name: 'Overview'}));
    await user.click(getByRole('button', {name: 'Ask about Overview'}));
    expect(onFollowUp).toHaveBeenLastCalledWith('a');
  });
});

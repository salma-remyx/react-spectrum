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

import {AnswerMap, segmentAnswer} from '@react-spectrum/ai';
import {categorizeArgTypes, getActionArgs} from '../../s2/stories/utils';
import type {Meta, StoryObj} from '@storybook/react';
import React from 'react';
import {style} from '@react-spectrum/s2/style' with {type: 'macro'};

const events = ['onFollowUp'];

// A long-form answer, normalized into grounded regions by segmentAnswer().
const answer = `## Overview
React Spectrum is a collection of libraries for building accessible, adaptive UIs.

## Performance
Packages were consolidated to improve tree shaking and reduce bundle size.

## Shadow DOM
Components now render inside Shadow DOM, resolving style encapsulation issues.`;

const meta: Meta<typeof AnswerMap> = {
  component: AnswerMap,
  parameters: {
    layout: 'centered'
  },
  tags: ['autodocs'],
  argTypes: {
    ...categorizeArgTypes('Events', events),
    segments: {table: {disable: true}}
  },
  args: {...getActionArgs(events)},
  title: 'AI/AnswerMap'
};

export default meta;
type Story = StoryObj<typeof AnswerMap>;

export const Example: Story = {
  render: args => {
    return (
      <div className={style({minWidth: 320, maxWidth: 480})}>
        <AnswerMap {...args} aria-label="Answer" segments={segmentAnswer(answer)} />
      </div>
    );
  }
};

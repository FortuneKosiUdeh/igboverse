"use client";
import React, { useState } from 'react';
import { DialectGroup, DIALECT_GROUPS, getDialectGroupLabel } from '@/lib/dialect';

/**
 * Interactive SVG map of southeastern Nigeria for dialect selection.
 * 
 * SVG paths sourced from @svg-maps/nigeria (MIT license).
 * Geographic accuracy verified against official LGA boundaries.
 * 
 * States shown:
 * - 5 SE Igbo states (interactive): Anambra, Imo, Abia, Enugu, Ebonyi
 * - 5 neighbor states (greyed, for context): Delta, Rivers, Cross River, Benue, Kogi
 */

// State → DialectGroup mapping
const STATE_TO_DIALECT: Record<string, DialectGroup> = {
    anambra: 'anambra',
    imo: 'imo',
    abia: 'abia',
    enugu: 'enugu',
    ebonyi: 'ebonyi',
};

// Community coverage counts (from live API verification, Feb 2025)
const COVERAGE: Record<DialectGroup, { communities: string[]; variants: number }> = {
    standard: { communities: [], variants: 0 },
    anambra: {
        communities: ['Ọnịcha', 'Achala', 'Obosi', 'Ogidi', 'Ọka', 'Anam', 'Ajalị'],
        variants: 52
    },
    imo: {
        communities: ['Owere', 'Mbaise', 'Isuama', 'Ihuoma', 'Amaifeke'],
        variants: 33
    },
    abia: {
        communities: ['Ngwa', 'Abịrịba', 'Mkpọọ', 'Ọhụhụ', 'Ụmụahịa'],
        variants: 49
    },
    enugu: {
        communities: ['Nsụka', 'Ezeagu', 'Nkanụ'],
        variants: 20
    },
    ebonyi: {
        communities: ['Afiikpo', 'Ezaa', 'Ikwo', 'Ezzamgbo', 'Izii'],
        variants: 13
    }
};

// Color palette for states
const STATE_COLORS: Record<DialectGroup, { fill: string; hover: string; selected: string; text: string }> = {
    standard: { fill: '#f3f4f6', hover: '#e5e7eb', selected: '#d1d5db', text: '#6b7280' },
    anambra: { fill: '#d1fae5', hover: '#a7f3d0', selected: '#34d399', text: '#065f46' },
    imo: { fill: '#dbeafe', hover: '#bfdbfe', selected: '#60a5fa', text: '#1e40af' },
    abia: { fill: '#fef3c7', hover: '#fde68a', selected: '#fbbf24', text: '#92400e' },
    enugu: { fill: '#fed7aa', hover: '#fdba74', selected: '#fb923c', text: '#9a3412' },
    ebonyi: { fill: '#fecaca', hover: '#fca5a5', selected: '#f87171', text: '#991b1b' },
};

// SVG paths from @svg-maps/nigeria (MIT), cropped to SE region
const SE_STATES = [
    {
        id: 'enugu',
        name: 'Enugu',
        path: `m 262.67165,444.90874 2.73,-5.01 0.91,0.25 0.18,2.28 0.74,0.05 1.33,2.01 0.69,0.34 1.24,-0.33 4.97,-5.39 5.98,-3.86 6.18,-7.42 2.44,-0.91 2.14,-2.1 3.31,-0.76 2.44,0.75 1.11,1.62 0,0 -0.13,0.53 2.74,6.51 2.89,3.35 3.58,2.76 2.92,1.52 2.1,-0.73 2.21,-2.11 2.81,0.35 1.52,1.15 1.42,2.14 0.9,5.62 -2.28,6.42 0,0 -1.79,0.36 -6.45,-0.55 1.48,4.9 0.38,3.29 0.65,1.15 -0.01,5.82 -2.74,6.11 -0.02,1.23 1.08,1.07 0.62,2.55 0.99,6.64 -0.8,1.73 -2.67,2.73 0.15,2.64 0.8,2.92 -0.65,1.44 -0.73,-0.07 -2.11,-2.51 -0.77,-0.09 -1.99,-1.7 -3.63,1.01 0,0 -0.33,-1.46 -2.05,-1.34 -2.71,-0.27 -4.83,0.89 -0.6,-0.77 0,0 -0.83,-0.17 0.04,-0.54 -1.12,-0.74 -1.08,-0.09 -1.66,0.96 -2.39,-1.4 -0.76,-0.98 -0.18,-1.51 -1.88,-3.79 0.35,-2.15 -1.33,-0.63 -0.59,-2.58 -0.61,-0.13 -1.89,1.13 -0.72,-0.74 0.5,-1.62 -0.41,-1.37 0.82,-0.29 0.3,-0.96 -1.31,-1.85 -1.34,-3.64 -1.42,-1.8 -3.85,-1.16 -0.39,-0.54 0.43,-2.35 0.62,-0.83 -0.24,-0.96 1.85,-2.48 1.69,-1.14 0.75,-1.08 1.25,-3.45 -0.36,-0.79 -3.73,-1.7 -2.05,-0.08 -2.44,-1.41 -3.83,0.13 -0.09,-3.62 z`
    },
    {
        id: 'anambra',
        name: 'Anambra',
        path: `m 262.67165,444.90874 0.44,0.4 0.09,3.62 3.83,-0.13 2.44,1.41 2.05,0.08 3.73,1.7 0.36,0.79 -1.25,3.45 -0.75,1.08 -1.69,1.14 -1.85,2.48 0.24,0.96 -0.62,0.83 -0.43,2.35 0.39,0.54 3.85,1.16 1.42,1.8 1.34,3.64 1.31,1.85 -0.3,0.96 -0.82,0.29 0.41,1.37 -0.5,1.62 0.72,0.74 1.89,-1.13 0.61,0.13 0.59,2.58 1.33,0.63 -0.35,2.15 1.88,3.79 0.18,1.51 0.76,0.98 2.39,1.4 1.66,-0.96 1.08,0.09 1.12,0.74 -0.04,0.54 0.83,0.17 0,0 -2.01,-1.69 0,0 -5.38,-1.25 -6.31,1.16 -1.78,1.04 -0.93,3.55 -2.37,4.61 -2.68,0.27 -4.51,-1.92 -1.62,0.8 -3,3.83 -2.09,0.83 0,0 -1.11,-1.28 -0.23,0.35 1.09,3.54 -0.82,3.18 -0.89,1.75 -2.05,1.42 -0.7,1.48 -0.19,5.3 -3.52,1.81 0,0 -1.71,-0.3 -2.43,1.15 -2.29,-0.76 -5.76,-8.38 -1.58,-1.21 -1.22,-2.4 -0.78,-0.38 -0.85,-2.69 -2.22,-3.59 -0.94,-2.65 -0.71,-3.86 0.12,-1.02 3.07,-4.81 2.78,-2.61 0.16,-3.28 -0.82,-5.73 -1.6,-3.4 -1.74,-1.86 -2.7,-1.54 -3.62,-1.06 -0.34,-3.57 0.8,-2.8 -0.17,-3.23 -0.72,-0.81 0.59,-4.46 1.78,-1.25 2.13,0.16 0.42,-0.35 0.32,-3.07 -0.22,-2.59 1.5,-0.42 2.73,1.11 2.91,2.7 0.12,1.18 1.25,1.83 0.85,0.17 0.81,-2.45 1.28,-1.63 2.39,-0.62 2.03,1.35 0.37,0.82 z`
    },
    {
        id: 'abia',
        name: 'Abia',
        path: `m 291.01165,491.65874 0.6,0.77 4.83,-0.89 2.71,0.27 2.05,1.34 0.33,1.46 0,0 0.07,4.36 -0.55,2.86 0.05,0.73 0.94,1.03 14.09,0.86 1.24,1.86 0.22,2.19 0.7,1.04 3.21,2.33 1.34,0.21 0,0 1.08,1.29 -0.59,3.72 0.15,3.78 1.37,4.63 0.73,1.68 1.71,2 0.76,2.55 -0.6,1.21 -3.42,-0.76 0,0 -2.69,-2.61 -2.54,-0.84 -2.76,-2.14 -0.58,-2.11 -1.19,-1.47 -3.4,-0.91 -2.42,0.14 -0.28,0.91 0.53,3.51 -1.84,5.1 0.32,0.45 2.23,-0.16 -0.7,2.44 -0.73,0.9 -6.08,-0.16 -1.1,0.98 -0.07,0.75 1.07,1.94 -1.21,5.81 -0.03,2.4 0.66,2.49 -1.17,2.89 -2.52,1.94 0.09,0.77 -0.47,0.64 0.22,1.47 0.59,0.67 0.02,1.17 -0.67,1.62 1.79,3.37 0.13,1.85 0,0 -2.36,-1.79 -2.94,-1.41 -1.8,0.43 -3.28,-1.22 -2.79,0.12 -1.11,0.64 -3.13,0.58 -1.8,-0.27 -1.45,-1.41 -0.59,-1.1 0.16,-1.1 1.37,-3.7 3.42,-4.33 2.39,-4.19 -0.05,-2.78 -0.66,-1.72 -0.54,-0.05 0,0 3.09,-10.25 2.1,-3.87 1.82,-1.68 1.18,-3.04 0.89,-0.9 0.43,-2.01 -0.36,-3.45 0.28,-2.05 -1.51,-2.44 1.23,-0.77 -0.38,-8.47 -0.47,-1.35 -1.04,-1.45 -5.34,-1.78 z`
    },
    {
        id: 'imo',
        name: 'Imo',
        path: `m 283.98165,497.48874 2.01,1.69 5.34,1.78 1.04,1.45 0.47,1.35 0.38,8.47 -1.23,0.77 1.51,2.44 -0.28,2.05 0.36,3.45 -0.43,2.01 -0.89,0.9 -1.18,3.04 -1.82,1.68 -2.1,3.87 -3.09,10.25 0,0 -2.57,0.95 -4.52,-1.13 -2.13,0.04 -4.15,1.06 -4.69,-1.11 -6.72,0.14 -2.14,-0.41 -2.16,-1.65 -1.72,-3.4 -1.84,-1.3 -0.26,-1.37 1.09,-2.76 0.52,-4.63 -0.45,-1.66 -2.12,-0.77 -3.46,0.67 -1.51,-0.44 2.75,-13.09 0,0 2.09,-0.83 3,-3.83 1.62,-0.8 4.51,1.92 2.68,-0.27 2.37,-4.61 0.93,-3.55 1.78,-1.04 6.31,-1.16 5.38,1.25 z`
    },
    {
        id: 'ebonyi',
        name: 'Ebonyi',
        path: `m 319.74165,453.93874 -0.17,0.91 0.65,1.54 4.01,3.68 1.78,0.74 1.41,-0.59 0.99,-0.13 2.54,1.81 4.69,-0.01 1.41,-0.7 0.79,0.1 0.62,2.09 1.62,1.7 1.34,0.67 0,0 -0.7,3.99 0.32,2.74 4.19,5.32 0.09,2.03 -0.39,1.75 0.22,2.87 2.14,6.2 -0.76,0.15 -3.28,-1.11 -1.6,-0.08 -4.95,1.11 -5.29,0.91 -1.04,-0.86 -0.04,-0.58 -0.85,-0.39 -3.06,1.09 -2.01,1.69 -1.92,0.8 -2.14,-0.54 -1.62,-0.97 -2.71,-3.54 -1.18,-0.57 0,0 -1.34,-0.21 -3.21,-2.33 -0.7,-1.04 -0.22,-2.19 -1.24,-1.86 -14.09,-0.86 -0.94,-1.03 -0.05,-0.73 0.55,-2.86 -0.07,-4.36 0,0 3.63,-1.01 1.99,1.7 0.77,0.09 2.11,2.51 0.73,0.07 0.65,-1.44 -0.8,-2.92 -0.15,-2.64 2.67,-2.73 0.8,-1.73 -0.99,-6.64 -0.62,-2.55 -1.08,-1.07 0.02,-1.23 2.74,-6.11 0.01,-5.82 -0.65,-1.15 -0.38,-3.29 -1.48,-4.9 6.45,0.55 1.79,-0.36 0,0 1.47,2.6 2.01,1.68 4.49,2.14 z`
    }
];

// Neighbor states (greyed out, for geographic context)
const NEIGHBOR_STATES = [
    {
        id: 'delta',
        name: 'Delta',
        path: `m 213.36165,479.60874 0.22,-2.27 1.67,-0.77 3.59,0.66 1.43,-0.89 1.84,-2.51 0.06,-2.73 1.24,-4.12 2.24,-2.31 1.54,-0.86 1.34,-1.87 0,0 0,0 0,0 -0.37,-0.82 -2.03,-1.35 -2.39,0.62 -1.28,1.63 -0.81,2.45 -0.85,-0.17 -1.25,-1.83 -0.12,-1.18 -2.91,-2.7 -2.73,-1.11 -1.5,0.42 0.22,2.59 -0.32,3.07 -0.42,0.35 -2.13,-0.16 -1.78,1.25 -0.59,4.46 0.72,0.81 0.17,3.23 -0.8,2.8 0.34,3.57 0,0 -3.64,0.02 -1.63,-0.93 -7.25,-0.56 -5.59,1.36 -5.52,-1.67 -7.12,0.96 -1.33,-1.63 -2.11,-0.76 -0.48,-2.14 -0.97,-0.66 -0.32,1.74 -1.21,1.72 -1.96,0.43 -0.04,1.48 0.84,2.65 0.11,3.47 -1.85,4.13 0.01,1.36 -1.88,3.41 0.44,3.34 -0.62,0.37 -1.47,-2.91 0.19,-1.69 -0.58,-1.43 -0.28,-0.94 -0.07,-0.07 -0.82,0.77 0.25,0.94 0.02,0.61 -0.56,0.14 -0.22,-0.16 -0.29,0.69 -0.73,-0.4 -0.55,-1.15 0.69,-2.33 -0.06,-0.94 -0.36,-0.29 -0.18,0.18 -0.72,0.41 -1.02,-0.36 -0.96,-1.62 0.66,-0.45 0.21,-0.73 -0.82,-0.95 -0.38,0.34 -0.7,0.03 -0.89,-1.9 0.48,-1.07 -0.08,-0.94 0.55,-0.91 0.13,-1.32 -0.56,-0.54 -0.63,-0.47 -0.64,0.4 -0.2,-1.71 -1.02,-2.13 -1.39,-1.37 -0.15,-1.25 0.93,-3.04 0,0 3.29,-3.2 3.38,-2.35 2.49,-3.29 0.47,-1.36 -0.17,-1.56 -1.95,-4.48 0.08,-1 0.73,-0.82 2.56,0.41 2.7,-1.04 1.47,-1.4 0.63,-2.11 0.09,-4.2 -0.32,-0.6 -2.32,-0.21 -1.47,0.21 -0.67,-0.21 0.07,-2.09 2.93,-4.31 4.72,-3.72 0.76,-1.22 0.48,-2.32 -0.09,-2.53 0.67,-5.3 1.14,-2.34 4.27,-3.57 1.09,-2.23 -0.03,-2.35 1.11,-2.66 0.24,-2.9 -0.59,-1.62 0.56,-3.89 -0.32,-1.91 -0.97,-2.11 0.15,-3.98 0.62,-1.91 0,0 4.62,-0.88 2.51,0.43 -0.71,4.14 2.04,2.7 4.74,4.17 0.23,0.78 0,0 0.77,0.64 1.75,-0.37 0.7,0.36 0.28,0.68 -0.38,0.89 0.46,0.65 2.18,-0.25 0.27,0.8 -0.96,1.85 -0.23,1.93 0.28,1.05 1.08,0.78 2.13,0.53 5.94,-2.93 1.56,2.1 0.65,-0.07 1.26,1.41 0.55,-0.06 1.96,2.23 2.26,-0.19 0.74,-0.51 2.56,0.15 1.06,2.01 0.07,1.22 0.85,0.61 0.48,1.74 0.74,0.56 -0.24,0.51 0.66,1.63 3.75,-0.84 0.43,0.38 1.46,-0.99 1.87,-0.41 1.75,1.41 0.55,2.12 1.45,1.08 0.79,2.01 0.15,3.41 -0.31,1.92 -1.62,3.94 0.06,4.16 -1.91,4.82 -2.16,3.55 1.28,2.15 -0.93,5.52 0.89,2.6 1.41,2.01 1.03,6.03 z`
    },
    {
        id: 'cross-river',
        name: 'Cross River',
        path: `m 341.34165,470.45874 0.7,-3.99 0,0 2.41,-0.15 0.39,-0.66 1.51,-0.31 0.73,0.2 4.38,-0.35 1.55,-0.69 3.7,3.23 4.09,2.69 1.19,0.08 2.09,-1.6 1.2,-0.3 1.34,0.22 1.56,-0.64 1.71,-2.04 0.72,-2.6 -0.6,-2.31 -1.28,-0.89 -0.68,-1.23 -0.26,-3.36 -1.2,-1.04 -0.03,-0.68 0.73,-0.66 2.73,-0.16 0.6,0.29 0.12,1.06 0.38,0.5 1.2,-0.71 -0.44,-1.02 0.28,-0.73 1.47,-1.15 0.44,-0.06 0,0 -0.48,3.49 0.37,5.68 1.85,2.68 0.15,2.76 1.21,2.32 0.73,5.88 0.4,0.73 3.54,0.12 0.17,1.66 -0.33,0.31 0.3,0.62 0.56,0.06 -0.33,4.25 -0.38,0.5 -9.51,5.98 -2.83,-0.14 -1.32,0.64 -1.52,2.02 -0.9,4.86 -1.07,2.22 -0.14,2.3 -0.41,0.67 0.37,0.68 -0.18,1.6 -0.47,0.48 0,0 -1.67,-0.11 -1.92,1.57 -0.19,1.82 -2.12,1.04 -1.13,1.39 -1.59,0.51 -0.23,0.71 0.42,2.61 -0.35,1.72 -0.64,0.19 -0.62,-0.84 -2.02,0.57 -1.5,-0.11 -0.62,2.13 -3.01,2.41 -0.77,0.06 -2.31,-1.59 -2.32,-0.59 -4.95,2.89 -2.98,-0.07 -1.41,0.98 -3.32,4.49 -0.75,0.27 -0.46,-1 -1.64,0.88 -1.05,-1.05 -0.92,0.24 -0.41,-0.26 -0.73,2.01 0.33,1.33 -0.63,0.22 -0.49,1.16 -0.52,-0.38 -0.1,1.18 -1.04,-0.82 -0.87,2.1 -1.75,-0.5 0.1,-0.53 -0.82,-0.34 -0.4,0.42 -1.29,-1.98 0.14,-0.73 -0.71,-0.96 -0.13,-3.43 -0.43,-0.83 -1.03,-0.17 -0.47,0.81 -1.03,0.36 -0.9,-0.41 -0.22,-1.72 0.67,-0.73 0.84,-0.04 0.8,-0.47 -0.18,-0.96 -1.21,0.12 -0.72,-0.5 0.1,-0.77 1.26,-2.18 -0.06,-0.96 -1.5,-0.63 -4.79,-3.7 -0.11,-0.71 -0.82,-0.74 -0.79,0.09 -2.88,-3.42 -0.66,0.2 0.06,1.08 -0.42,0.11 -1.21,-1.43 -2.83,-0.37 -2.4,1.87 0.25,0.8 -0.39,0.64 0,0 -0.76,-2.55 -1.71,-2 -0.73,-1.68 -1.37,-4.63 -0.15,-3.78 0.59,-3.72 -1.08,-1.29 0,0 1.18,0.57 2.71,3.54 1.62,0.97 2.14,0.54 1.92,-0.8 2.01,-1.69 3.06,-1.09 0.85,0.39 0.04,0.58 1.04,0.86 5.29,-0.91 4.95,-1.11 1.6,0.08 3.28,1.11 0.76,-0.15 -2.14,-6.2 -0.22,-2.87 0.39,-1.75 -0.09,-2.03 -4.19,-5.32 -0.32,-2.74 z`
    },
    {
        id: 'benue',
        name: 'Benue',
        path: `m 299.51165,423.12874 0.13,-0.53 0,0 -1.11,-1.62 0,0 0.41,-0.5 0.84,0.58 3.37,3.29 0.82,-0.1 1.35,1.05 1.76,0 0.34,-4.42 0.96,-1.44 6.44,-3.12 3.3,-3.11 1.94,-5.83 0.42,-3.93 0.47,-1.29 1.23,-1.21 0.36,-1.81 -1.48,-0.47 -3.31,0.32 -1.27,-1.05 -1.24,-5.53 -0.57,-6.81 -0.01,-6.9 -0.73,-1.85 -2.7,-2.61 -1.88,-3.22 -0.54,-5.87 0.32,-2.84 0,0 7.37,2.13 3.4,-0.33 2.08,-1.02 0.62,-0.89 0.37,-5.42 1.31,-1.91 3.12,-0.76 4.19,0.87 2.26,-0.21 0,0 0,0 4.13,-3.86 0.81,0.77 7.96,-5.85 1.61,0.14 2.15,2.95 5.54,0.49 1.53,0.57 7.81,-3.25 1.55,-0.14 1.55,1.45 1.04,2.62 1.97,1.44 2.77,0.91 5.97,-0.48 2.99,-1.79 6.27,-0.34 3.97,1.2 2.06,-0.41 2.14,1.68 4.28,1.64 3.29,-0.78 3.14,-2.28 1.83,-0.03 1.4,0.81 3.99,6.1 5.06,3.69 0.65,1.61 -0.79,2.93 0,0 -1.67,0.71 -0.67,1.62 0.39,1.99 -1.36,2.45 4.37,5.52 0.89,2.1 -0.99,3.09 0.04,1.55 1.41,1.09 0.21,0.88 -0.35,0.9 -2.86,2.09 0.06,1.41 3.5,2.48 2.44,2.34 2.62,1.5 -0.17,2.62 0.64,0.83 3.45,0.66 2.2,1.87 0.33,0.94 -0.98,2.86 -2.59,3.34 0,0 -9.19,3.5 -2.47,2.43 -3.56,0.67 -2.53,1.63 -3.26,5.35 -2.79,1.62 -2.22,0.63 -4.83,-2.42 -3.27,-0.53 -2.84,-2.57 -2.63,-0.67 -4.93,0.85 -5.51,-0.87 -3.94,1.97 -1.7,0.22 -8.32,-3.16 -2.9,-2.04 -2.4,-3.51 -1.94,-4.74 -1.57,-1.29 -2.58,0.73 -4.35,3.26 -4.37,2.16 -3.12,0.76 -1.47,0.37 0,0 -1.34,-0.67 -1.62,-1.7 -0.62,-2.09 -0.79,-0.1 -1.41,0.7 -4.69,0.01 -2.54,-1.81 -0.99,0.13 -1.41,0.59 -1.78,-0.74 -4.01,-3.68 -0.65,-1.54 0.17,-0.91 0,0 -4.49,-2.14 -2.01,-1.68 -1.47,-2.6 0,0 2.28,-6.42 -0.9,-5.62 -1.42,-2.14 -1.52,-1.15 -2.81,-0.35 -2.21,2.11 -2.1,0.73 -2.92,-1.52 -3.58,-2.76 -2.89,-3.35 -2.74,-6.51 z`
    }
];

// Label positions (approximate center points for each state, in SVG coordinates)
const STATE_LABELS: Record<string, { x: number; y: number }> = {
    enugu: { x: 279, y: 458 },
    anambra: { x: 257, y: 482 },
    abia: { x: 300, y: 520 },
    imo: { x: 270, y: 525 },
    ebonyi: { x: 327, y: 480 },
};

interface DialectMapProps {
    selectedDialect: DialectGroup;
    onSelect: (group: DialectGroup) => void;
}

export default function DialectMap({ selectedDialect, onSelect }: DialectMapProps) {
    const [hoveredState, setHoveredState] = useState<string | null>(null);

    const getStateFill = (stateId: string): string => {
        const dialect = STATE_TO_DIALECT[stateId];
        if (!dialect) return '#f3f4f6';
        const colors = STATE_COLORS[dialect];
        if (selectedDialect === dialect) return colors.selected;
        if (hoveredState === stateId) return colors.hover;
        return colors.fill;
    };

    const getStateStroke = (stateId: string): string => {
        const dialect = STATE_TO_DIALECT[stateId];
        if (!dialect) return '#d1d5db';
        if (selectedDialect === dialect) return STATE_COLORS[dialect].text;
        return '#9ca3af';
    };

    const getStateStrokeWidth = (stateId: string): number => {
        const dialect = STATE_TO_DIALECT[stateId];
        if (selectedDialect === dialect) return 2;
        return 0.8;
    };

    const hoveredDialect = hoveredState ? STATE_TO_DIALECT[hoveredState] : null;
    const displayDialect = hoveredDialect || (selectedDialect !== 'standard' ? selectedDialect : null);
    const displayInfo = displayDialect ? COVERAGE[displayDialect] : null;
    const displayName = displayDialect
        ? SE_STATES.find(s => STATE_TO_DIALECT[s.id] === displayDialect)?.name || ''
        : '';

    return (
        <div className="dialect-map-container">
            <div className="dialect-map-header">
                <h3 className="dialect-map-title">
                    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                        <circle cx="12" cy="12" r="10" />
                        <line x1="2" y1="12" x2="22" y2="12" />
                        <path d="M12 2a15.3 15.3 0 0 1 4 10 15.3 15.3 0 0 1-4 10 15.3 15.3 0 0 1-4-10 15.3 15.3 0 0 1 4-10z" />
                    </svg>
                    Select Your Dialect Region
                </h3>
                <p className="dialect-map-subtitle">
                    Tap a state on the map, or choose Standard Igbo
                </p>
            </div>

            <div className="dialect-map-wrapper">
                {/* SVG Map */}
                <svg
                    viewBox="200 395 200 170"
                    className="dialect-map-svg"
                    aria-label="Map of southeastern Nigeria for dialect selection"
                >
                    {/* Neighbor states (greyed context) */}
                    {NEIGHBOR_STATES.map((state) => (
                        <path
                            key={state.id}
                            d={state.path}
                            fill="#f0f0f0"
                            stroke="#d4d4d4"
                            strokeWidth="0.5"
                            className="dialect-map-neighbor"
                        />
                    ))}

                    {/* SE states (interactive) */}
                    {SE_STATES.map((state) => (
                        <path
                            key={state.id}
                            d={state.path}
                            fill={getStateFill(state.id)}
                            stroke={getStateStroke(state.id)}
                            strokeWidth={getStateStrokeWidth(state.id)}
                            className="dialect-map-state"
                            onClick={() => onSelect(STATE_TO_DIALECT[state.id])}
                            onMouseEnter={() => setHoveredState(state.id)}
                            onMouseLeave={() => setHoveredState(null)}
                            aria-label={`Select ${state.name} dialect`}
                            role="button"
                            tabIndex={0}
                            onKeyDown={(e) => {
                                if (e.key === 'Enter' || e.key === ' ') {
                                    e.preventDefault();
                                    onSelect(STATE_TO_DIALECT[state.id]);
                                }
                            }}
                        />
                    ))}

                    {/* State labels */}
                    {SE_STATES.map((state) => {
                        const label = STATE_LABELS[state.id];
                        if (!label) return null;
                        const dialect = STATE_TO_DIALECT[state.id];
                        const isSelected = selectedDialect === dialect;
                        return (
                            <text
                                key={`label-${state.id}`}
                                x={label.x}
                                y={label.y}
                                textAnchor="middle"
                                className="dialect-map-label"
                                style={{
                                    fontSize: isSelected ? '6px' : '5px',
                                    fontWeight: isSelected ? 700 : 500,
                                    fill: isSelected ? STATE_COLORS[dialect].text : '#4b5563',
                                    pointerEvents: 'none',
                                    textShadow: '0 0 3px rgba(255,255,255,0.8)',
                                }}
                            >
                                {state.name}
                            </text>
                        );
                    })}
                </svg>

                {/* Info Panel */}
                <div className="dialect-map-info">
                    {displayDialect && displayInfo ? (
                        <>
                            <div className="dialect-info-header" style={{ borderColor: STATE_COLORS[displayDialect].selected }}>
                                <span
                                    className="dialect-info-dot"
                                    style={{ backgroundColor: STATE_COLORS[displayDialect].selected }}
                                />
                                <span className="dialect-info-name">{displayName} State</span>
                            </div>
                            <div className="dialect-info-communities">
                                <span className="dialect-info-label">Communities:</span>
                                <span className="dialect-info-value">
                                    {displayInfo.communities.join(', ')}
                                </span>
                            </div>
                            <div className="dialect-info-coverage">
                                <span className="dialect-info-label">Word variants:</span>
                                <span className="dialect-info-count">{displayInfo.variants}</span>
                            </div>
                        </>
                    ) : (
                        <div className="dialect-info-placeholder">
                            {selectedDialect === 'standard'
                                ? 'Hover or tap a state to see dialect info'
                                : `${getDialectGroupLabel(selectedDialect)} selected`
                            }
                        </div>
                    )}
                </div>
            </div>

            {/* Standard Igbo toggle */}
            <button
                className={`dialect-standard-btn ${selectedDialect === 'standard' ? 'dialect-standard-btn-active' : ''}`}
                onClick={() => onSelect('standard')}
            >
                📚 Standard Igbo (Igbo Izugbe)
            </button>

            <p className="dialect-map-note">
                {selectedDialect === 'standard'
                    ? 'Using Standard Igbo for all content.'
                    : `Showing ${getDialectGroupLabel(selectedDialect)} word variants when available. Conjugation & structure exercises use Standard Igbo.`
                }
            </p>
        </div>
    );
}

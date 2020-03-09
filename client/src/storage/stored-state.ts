/*
 * Copyright (c) 2019. Beautiful Code BV, Rotterdam, Netherlands
 * Licensed under GNU GENERAL PUBLIC LICENSE Version 3.
 */

import { FabricFeature, IntervalRole, SurfaceCharacter } from "eig"

import { FABRIC_FEATURES } from "../fabric/eig-util"
import { IFeatureConfig } from "../fabric/fabric-features"
import { codeToTenscript, ITenscript } from "../fabric/tenscript"

export enum ControlTab {
    Grow = "Grow",
    Shape = "Shape",
    Realize = "Realize",
    View = "View",
    Strain = "Strain",
}

const VERSION = "2020-03-09"

export interface IFeatureValue {
    numeric: number
    percent: number
}

export interface IStoredState {
    version: string
    nonce: number
    surfaceCharacter: SurfaceCharacter
    featureValues: Record<FabricFeature, IFeatureValue>
    recentCode: Record<string, string>
    controlTab: ControlTab
    fullScreen: boolean
    ellipsoids: boolean
    rotating: boolean
    showPushes: boolean
    showPulls: boolean
}

export function addRecentCode(state: IStoredState, {code, name}: ITenscript): IStoredState {
    const recentCode = {...state.recentCode}
    recentCode[name] = code
    return transition(state, {recentCode})
}

export function getRecentTenscript(state: IStoredState): ITenscript[] {
    return Object.keys(state.recentCode).map(key => {
        const code = state.recentCode[key]
        const tenscript = codeToTenscript(error => console.error(error), false, code)
        if (!tenscript) {
            throw new Error(`Unable to read recent tenscript code: ${code}`)
        }
        return tenscript
    })
}

export function roleLengthFeature(intervalRole: IntervalRole): FabricFeature {
    switch (intervalRole) {
        case IntervalRole.NexusPush:
            return FabricFeature.NexusPushLength
        case IntervalRole.ColumnPush:
            return FabricFeature.ColumnPushLength
        case IntervalRole.Triangle:
            return FabricFeature.TriangleLength
        case IntervalRole.Ring:
            return FabricFeature.RingLength
        case IntervalRole.NexusCross:
            return FabricFeature.NexusCrossLength
        case IntervalRole.ColumnCross:
            return FabricFeature.ColumnCrossLength
        case IntervalRole.BowMid:
            return FabricFeature.BowMidLength
        case IntervalRole.BowEnd:
            return FabricFeature.BowEndLength
        default:
            throw new Error("role?")
    }
}

export function roleDefaultFromFeatures(featureValues: Record<FabricFeature, IFeatureValue>, intervalRole: IntervalRole): number {
    if (intervalRole === IntervalRole.FacePull) {
        throw new Error()
    }
    return featureValues[roleLengthFeature(intervalRole)].numeric
}

export function transition(state: IStoredState, partial: Partial<IStoredState>): IStoredState {
    return {...state, nonce: state.nonce + 1, ...partial}
}

function initialStoredState(toConfig: (feature: FabricFeature) => IFeatureConfig, defaultValue: (feature: FabricFeature) => number): IStoredState {
    const DEFAULT_FEATURE_VALUES = FABRIC_FEATURES.map(toConfig)
        .reduce((record, config) => {
            record[config.feature] = ({percent: 100, numeric: defaultValue(config.feature)})
            return record
        }, {} as Record<FabricFeature, IFeatureValue>)

    return ({
        version: VERSION,
        nonce: 0,
        surfaceCharacter: SurfaceCharacter.Frozen,
        featureValues: DEFAULT_FEATURE_VALUES,
        recentCode: {},
        controlTab: ControlTab.Grow,
        fullScreen: true,
        ellipsoids: false,
        rotating: false,
        showPushes: true,
        showPulls: true,
    })
}

const STORED_STATE_KEY = "State"

export function saveState(storedState: IStoredState): void {
    localStorage.setItem(STORED_STATE_KEY, JSON.stringify(storedState))
}

export function loadState(toConfig: (feature: FabricFeature) => IFeatureConfig, defaultValue: (feature: FabricFeature) => number): IStoredState {
    const item = localStorage.getItem(STORED_STATE_KEY)
    if (item) {
        const storedState = JSON.parse(item) as IStoredState
        if (storedState.version === VERSION) {
            return storedState
        }
    }
    return initialStoredState(toConfig, defaultValue)
}

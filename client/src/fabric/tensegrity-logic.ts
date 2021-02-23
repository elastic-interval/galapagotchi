import { Vector3 } from "three"

import { IntervalRole, intervalRoleName, isPushRole } from "./eig-util"
import {
    factorFromPercent,
    IInterval,
    IJoint,
    intervalLength,
    IPercent,
    ITip,
    jointLocation,
    otherJoint,
    percentFromFactor,
    percentOrHundred,
} from "./tensegrity-types"

function indexKey(a: number, b: number): string {
    return a < b ? `(${a},${b})` : `(${b},${a})`
}

export interface ITipPair {
    alpha: ITip
    omega: ITip
    scale: IPercent
}

export type IntervalRoleFilter = (a: IntervalRole, b: IntervalRole, hasPush: boolean) => boolean

export type TipPairInclude = (pair: ITipPair) => boolean

function addTip(joint: IJoint, push: IInterval): ITip {
    const location = jointLocation(joint)
    const outwards = new Vector3().subVectors(location, jointLocation(otherJoint(joint, push))).normalize()
    const pushLength = intervalLength(push)
    return joint.tip = {joint, location, outwards, pushLength}
}

function createTips(intervals: IInterval[]): ITip[] {
    const tips: ITip[] = []
    intervals
        .filter(({intervalRole}) => isPushRole(intervalRole))
        .forEach(push => {
            const {alpha, omega} = push
            tips.push(addTip(alpha, push), addTip(omega, push))
        })
    return tips
}

function removeTips(intervals: IInterval[]): void {
    intervals.forEach(({alpha, omega}) => {
        alpha.tip = undefined
        omega.tip = undefined
    })
}

export function tipCandidates(intervals: IInterval[], include: TipPairInclude): ITipPair[] {
    const intervalKey = (a: ITip, b: ITip) => indexKey(a.joint.index, b.joint.index)
    const tipPairs: Record<string, ITipPair> = {}
    const recordPair = (pair: ITipPair): void => {
        const {alpha, omega} = pair
        tipPairs[intervalKey(alpha, omega)] = pair
    }
    const tips = createTips(intervals)
    intervals.forEach(interval => {
        const alpha = interval.alpha.tip
        const omega = interval.omega.tip
        if (!alpha || !omega) {
            return
        }
        const scale = interval.scale
        recordPair({alpha, omega, scale})
    })
    const newPairs: ITipPair[] = []
    tips.forEach(tip => tips
        .filter(({joint, location, pushLength}) =>
            joint.index !== tip.joint.index && location.distanceTo(tip.location) < pushLength)
        .forEach(nearTip => {
            const existing = tipPairs[intervalKey(tip, nearTip)]
            if (!existing) {
                const pair: ITipPair = {alpha: tip, omega: nearTip, scale: percentOrHundred()} // TODO scale
                if (include(pair)) {
                    newPairs.push(pair)
                    recordPair(pair)
                }
            }
        }))
    removeTips(intervals)
    return newPairs
}

export interface ITrianglePair {
    alpha: IJoint
    omega: IJoint
    scale: IPercent
}

export function triangulationCandidates(intervals: IInterval[], joints: IJoint[], include: IntervalRoleFilter): ITrianglePair[] {
    const intervalKey = (a: IJoint, b: IJoint) => indexKey(a.index, b.index)
    const pulls = intervals.filter(({intervalRole}) => !isPushRole(intervalRole))
    const pullMap: Record<string, ITrianglePair> = {}
    const record = (pair: ITrianglePair): void => {
        const {alpha, omega} = pair
        pullMap[intervalKey(alpha, omega)] = pair
    }
    pulls.forEach(pull => {
        const add = (joint: IJoint) => joint.pulls.push(pull)
        add(pull.alpha)
        add(pull.omega)
    })
    intervals.forEach(interval => record(interval))
    const newPairs: ITrianglePair[] = []

    function oppositeJoints(a: IInterval, b: IInterval): { pair: ITrianglePair, common: IJoint } {
        const scale = percentFromFactor((factorFromPercent(a.scale) + factorFromPercent(b.scale)) / 2)
        if (a.alpha.index === b.alpha.index) {
            return {pair: {alpha: a.omega, omega: b.omega, scale}, common: a.alpha}
        } else if (a.alpha.index === b.omega.index) {
            return {pair: {alpha: a.omega, omega: b.alpha, scale}, common: a.alpha}
        } else if (a.omega.index === b.alpha.index) {
            return {pair: {alpha: a.alpha, omega: b.omega, scale}, common: a.omega}
        } else if (a.omega.index === b.omega.index) {
            return {pair: {alpha: a.alpha, omega: b.alpha, scale}, common: a.omega}
        } else {
            throw new Error("Bad pair")
        }
    }

    joints.forEach(joint => {
        const pullsHere = joint.pulls
        if (pullsHere) {
            pullsHere.forEach((a, indexA) => {
                pullsHere.forEach((b, indexB) => {
                    if (indexB <= indexA) {
                        return
                    }
                    const {pair, common} = oppositeJoints(a, b)
                    if (!include(a.intervalRole, b.intervalRole, !!common.push)) {
                        return
                    }
                    const existing = pullMap[intervalKey(pair.alpha, pair.omega)]
                    if (!existing) {
                        newPairs.push(pair)
                        record(pair)
                    }
                })
            })
        }
    })
    pulls.forEach(({alpha, omega}) => {
        alpha.pulls = []
        omega.pulls = []
    })
    return newPairs
}

export interface ISquarePair {
    alpha: IJoint
    omega: IJoint
    intervalRole: IntervalRole
    scale: IPercent
}

export function squareCandidates(intervals: IInterval[]): ISquarePair[] {
    const intervalKey = (a: IJoint, b: IJoint) => indexKey(a.index, b.index)
    const pullMap: Record<string, ITrianglePair> = {}
    const record = (pair: ITrianglePair): void => {
        const {alpha, omega} = pair
        pullMap[intervalKey(alpha, omega)] = pair
    }
    intervals
        .forEach(interval => record(interval))
    intervals
        .filter(({intervalRole}) => intervalRole === IntervalRole.PullA)
        .forEach(pullA => {
            const add = (joint: IJoint) => joint.pulls.push(pullA)
            add(pullA.alpha)
            add(pullA.omega)
        })
    const newPairs: ISquarePair[] = []
    const other = (ourJoint: IJoint, interval: IInterval) => {
        const across = otherJoint(ourJoint, interval)
        const direction = new Vector3().subVectors(jointLocation(across), jointLocation(ourJoint)).normalize()
        const joint = across.push ? across : ourJoint
        return {joint, direction}
    }
    intervals
        .filter(({intervalRole}) => !isPushRole(intervalRole))
        .forEach(({alpha, omega, scale, intervalRole}) => {
            alpha.pulls.forEach(alphaA => {
                const alphaX = other(alpha, alphaA)
                omega.pulls.forEach(omegaA => {
                    const omegaX = other(omega, omegaA)
                    const existing = pullMap[intervalKey(alphaX.joint, omegaX.joint)]
                    if (!existing) {
                        const dot = alphaX.direction.dot(omegaX.direction)
                        if (dot > 0.7) {
                            console.log(intervalRoleName(intervalRole), dot.toFixed(3))
                            const pair: ISquarePair = {alpha: alphaX.joint, omega: omegaX.joint, scale, intervalRole}
                            newPairs.push(pair)
                            record(pair)
                        }
                    }
                })
            })
        })
    intervals.forEach(({alpha, omega}) => {
        alpha.pulls = []
        omega.pulls = []
    })
    return newPairs
}

/*
 * Copyright (c) 2020. Beautiful Code BV, Rotterdam, Netherlands
 * Licensed under GNU GENERAL PUBLIC LICENSE Version 3.
 */

import { IntervalRole, WorldFeature } from "eig"
import { Vector3 } from "three"

import { roleDefaultLength } from "../pretenst"

import { Tensegrity } from "./tensegrity"
import { scaleToInitialStiffness } from "./tensegrity-optimizer"
import { IInterval, IJoint, IPercent, otherJoint, percentToFactor } from "./tensegrity-types"

export enum Chirality {Left, Right}

function oppositeChirality(chirality: Chirality): Chirality {
    switch (chirality) {
        case Chirality.Left:
            return Chirality.Right
        case Chirality.Right:
            return Chirality.Left
    }
}

interface IFace {
    index: number,
    chirality: Chirality
    pulls: IInterval[]
    ends: IJoint[]
}

function faceMidpoint(face: IFace): Vector3 {
    const midpoint = new Vector3()
    face.ends.forEach(end => midpoint.add(end.location()))
    return midpoint.multiplyScalar(1 / face.ends.length)
}

interface ITwist {
    faces: IFace[]
    scale: IPercent
    pushes: IInterval[]
}

// interface ISphere {
//     faces: IFace[]
//     scale: IPercent
//     pushes: IInterval[]
// }

type IntervalFactory = (alpha: IJoint, omega: IJoint, intervalRole: IntervalRole) => IInterval

const CYL_SIZE = 3

export class TensegrityBuilder {

    private faces: IFace[] = []

    constructor(private tensegrity: Tensegrity) {
    }

    public createTwistAt(midpoint: Vector3, chirality: Chirality, scale: IPercent): ITwist {
        return this.createTwist(chirality, scale, false)
    }

    public createOmniTwistAt(midpoint: Vector3, chirality: Chirality, scale: IPercent): ITwist {
        const firstTwist = this.createTwist(chirality, scale, true)
        const nnn = firstTwist.faces[0]
        const secondTwist = this.createTwist(oppositeChirality(chirality), scale, true, firstTwist.faces[1])
        const ppp = secondTwist.faces[1]
        return {
            scale,
            pushes: [...firstTwist.pushes, ...secondTwist.pushes],
            faces: [nnn, ppp],
            // faces: [nnn, pnn, npn, nnp, npp, pnp, ppn, ppp],
        }
    }

    public createTwistOn(face: IFace, scale: IPercent): ITwist {
        const chirality = oppositeChirality(face.chirality)
        return this.createTwist(chirality, scale, false, face)
    }

    private createTwist(chirality: Chirality, scale: IPercent, omni: boolean, baseFace?: IFace): ITwist {
        const points = baseFace ? faceTwistPoints(baseFace, scale, omni) : firstTwistPoints(scale, omni)
        const ends = points.map(({alpha, omega}) => ({
            alpha: this.tensegrity.createIJoint(alpha),
            omega: this.tensegrity.createIJoint(omega),
        }))
        this.tensegrity.instance.refreshFloatView()
        const createInterval: IntervalFactory = (alpha, omega, intervalRole) => {
            const countdown = this.tensegrity.numericFeature(WorldFeature.IntervalCountdown)
            const stiffness = scaleToInitialStiffness(scale)
            const linearDensity = Math.sqrt(stiffness)
            return this.tensegrity.createInterval(alpha, omega, intervalRole, scale, stiffness, linearDensity, countdown)
        }
        const alphaEnds = ends.map(({alpha}) => alpha)
        const alphaFace: IFace = {
            index: this.tensegrity.fabric.create_face(alphaEnds[0].index, alphaEnds[2].index, alphaEnds[1].index),
            chirality, ends: alphaEnds,
            pulls: ends.map(({alpha}, index) =>
                createInterval(alpha, ends[(index + 1) % ends.length].alpha, IntervalRole.Triangle)),
        }
        const omegaEnds = ends.map(({omega}) => omega)
        const omegaFace: IFace = {
            index: this.tensegrity.fabric.create_face(omegaEnds[0].index, omegaEnds[1].index, omegaEnds[2].index),
            chirality, ends: omegaEnds,
            pulls: ends.map(({omega}, index) =>
                createInterval(omega, ends[(index + 1) % ends.length].omega, IntervalRole.Triangle)),
        }
        this.faces.push(alphaFace, omegaFace)
        const twist: ITwist = {scale, pushes: [], faces: [alphaFace, omegaFace]}
        ends.forEach(({alpha, omega}) => {
            const push = createInterval(alpha, omega, IntervalRole.ColumnPush)
            twist.pushes.push(push)
            alpha.push = omega.push = push
        })
        ends.forEach(({alpha}, index) => {
            const offset = twist.faces[0].chirality === Chirality.Left ? ends.length - 1 : 1
            const omega = ends[(index + offset) % ends.length].omega
            createInterval(alpha, omega, IntervalRole.Triangle)
        })
        if (baseFace) {
            this.connectFace(baseFace, twist, omni, createInterval)
        }
        return twist
    }

    private connectFace(baseFace: IFace, twist: ITwist, omni: boolean, createInterval: IntervalFactory): void {
        const a = baseFace.ends.map(baseEnd => otherJoint(baseEnd))
        const b = baseFace.ends
        const c = twist.faces[0].ends
        const d = twist.faces[1].ends
        const ringRole = omni ? IntervalRole.Triangle : IntervalRole.Ring
        const offsetA = baseFace.chirality === Chirality.Left ? 1 : 0
        const offsetB = twist.faces[0].chirality === Chirality.Left ? 1 : 0
        for (let index = 0; index < baseFace.ends.length; index++) {
            createInterval(b[index], c[index], ringRole)
            createInterval(c[index], b[(index + 1) % b.length], ringRole)
            createInterval(c[index], a[(index + offsetA) % a.length], IntervalRole.Triangle)
            createInterval(d[index], b[(index + offsetB) % b.length], IntervalRole.Triangle)
        }
        this.remove(baseFace)
        this.remove(twist.faces[0])
    }

    private remove(face: IFace): void {
        face.pulls.forEach(pull => this.tensegrity.removeInterval(pull))
        face.pulls = []
        this.tensegrity.fabric.remove_face(face.index)
        this.faces = this.faces.filter(existing => existing.index !== face.index)
        this.faces.forEach(existing => {
            if (existing.index > face.index) {
                existing.index--
            }
        })
    }
}

interface IPoint {
    alpha: Vector3
    omega: Vector3
}

function firstTwistPoints(scale: IPercent, omni: boolean): IPoint[] {
    const base: Vector3[] = []
    for (let index = 0; index < CYL_SIZE; index++) {
        const angle = index * Math.PI * 2 / CYL_SIZE
        const x = Math.cos(angle)
        const y = Math.sin(angle)
        base.push(new Vector3(x, 0, y))
    }
    return twistPoints(new Vector3(), base.reverse(), scale, omni, false)
}

function faceTwistPoints(face: IFace, scale: IPercent, omni: boolean): IPoint[] {
    const midpoint = faceMidpoint(face)
    const base = face.ends.map(end => end.location())
    return twistPoints(midpoint, base, scale, omni, true)
}

function twistPoints(midpoint: Vector3, base: Vector3[], scale: IPercent, omni: boolean, apex: boolean): IPoint[] {
    const scaleFactor = percentToFactor(scale)
    const pushLength = scaleFactor * roleDefaultLength(omni ? IntervalRole.NexusPush : IntervalRole.ColumnPush)
    const initialLength = pushLength * 0.25
    const radialLength = scaleFactor / Math.sqrt(3)
    const points: IPoint[] = []
    const sub = (a: Vector3, b: Vector3) => new Vector3().subVectors(a, b).normalize()
    const mid = () => new Vector3().copy(midpoint)
    for (let index = 0; index < base.length; index++) {
        const a = sub(base[index], midpoint)
        const b = sub(base[(index + 1) % base.length], midpoint)
        const ab = new Vector3().addVectors(a, b).normalize()
        const up = new Vector3().crossVectors(a, b).normalize().multiplyScalar(initialLength)
        const alpha = mid()
        const omega = mid().add(up)
        const tinyRadius = 0.2 * initialLength
        omega.addScaledVector(ab, tinyRadius)
        alpha.addScaledVector(ab, apex ? radialLength / 2 : tinyRadius)
        points.push({alpha, omega})
    }
    return points
}

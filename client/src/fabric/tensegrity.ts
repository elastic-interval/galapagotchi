/*
 * Copyright (c) 2019. Beautiful Code BV, Rotterdam, Netherlands
 * Licensed under GNU GENERAL PUBLIC LICENSE Version 3.
 */

import { Fabric, Stage, WorldFeature } from "eig"
import { BehaviorSubject } from "rxjs"
import { Vector3 } from "three"

import { IFabricOutput, IOutputInterval, IOutputJoint } from "../storage/download"

import { CONNECTOR_LENGTH, IntervalRole, intervalRoleName, isPushRole, roleDefaultLength } from "./eig-util"
import { FabricInstance } from "./fabric-instance"
import { execute, IBud, IMark, ITenscript, MarkAction } from "./tenscript"
import { TensegrityBuilder } from "./tensegrity-builder"
import { TensegrityOptimizer } from "./tensegrity-optimizer"
import {
    expectPush,
    FaceSelection,
    factorFromPercent,
    IFace,
    IInterval,
    IJoint,
    intervalJoins,
    intervalLength,
    IPercent,
    IRadialPull,
    jointDistance,
    jointHolesFromJoint,
    jointLocation,
    locationFromFace,
    percentFromFactor,
    percentOrHundred,
    Spin,
} from "./tensegrity-types"

export type Job = (tensegrity: Tensegrity) => void

export class Tensegrity {
    public stage$: BehaviorSubject<Stage>
    public joints: IJoint[] = []
    public intervals: IInterval[] = []
    public connectors: IRadialPull[] = []
    public faces: IFace[] = []
    public pushesPerTwist: number
    public readonly builder: TensegrityBuilder

    private jobs: Job[] = []
    private buds: IBud[]

    constructor(
        public readonly location: Vector3,
        public readonly scale: IPercent,
        public readonly numericFeature: (worldFeature: WorldFeature) => number,
        public readonly instance: FabricInstance,
        public readonly tenscript: ITenscript,
    ) {
        this.instance.clear()
        this.stage$ = new BehaviorSubject(this.fabric.get_stage())
        this.pushesPerTwist = this.tenscript.pushesPerTwist
        this.builder = new TensegrityBuilder(this)
        this.buds = [this.builder.createBud(this.tenscript)]
    }

    public get fabric(): Fabric {
        return this.instance.fabric
    }

    public get intervalsWithStats(): IInterval[] {
        return this.intervals.filter(interval => interval.stats)
    }

    public createJoint(location: Vector3): IJoint { // TODO: remove joint, reuse them
        const index = this.fabric.create_joint(location.x, location.y, location.z)
        const newJoint: IJoint = {index, instance: this.instance}
        this.joints.push(newJoint)
        return newJoint
    }

    public createRadialPull(alpha: IFace, omega: IFace, pullScale?: IPercent): IRadialPull {
        const alphaJoint = this.createJoint(locationFromFace(alpha))
        const omegaJoint = this.createJoint(locationFromFace(omega))
        this.instance.refreshFloatView()
        const axis = this.creatAxis(alphaJoint, omegaJoint, pullScale)
        const alphaRestLength = alpha.ends.reduce((sum, end) => sum + jointDistance(alphaJoint, end), 0) / alpha.ends.length
        const omegaRestLength = omega.ends.reduce((sum, end) => sum + jointDistance(omegaJoint, end), 0) / omega.ends.length
        const alphaRays = alpha.ends.map(end => this.createRay(alphaJoint, end, alphaRestLength))
        const omegaRays = omega.ends.map(end => this.createRay(omegaJoint, end, omegaRestLength))
        const radialPull: IRadialPull = {alpha, omega, axis, alphaRays, omegaRays}
        if (axis.intervalRole === IntervalRole.ConnectorPull) {
            this.connectors.push(radialPull)
        }
        return radialPull
    }

    public createInterval(alpha: IJoint, omega: IJoint, intervalRole: IntervalRole, scale: IPercent): IInterval {
        const restLength = roleDefaultLength(intervalRole) * factorFromPercent(scale)
        const idealLength = jointDistance(alpha, omega)
        const countdown = this.numericFeature(WorldFeature.IntervalCountdown) * Math.abs(restLength - idealLength)
        const index = this.fabric.create_interval(alpha.index, omega.index, isPushRole(intervalRole), idealLength, restLength, countdown)
        const interval: IInterval = {index, intervalRole, scale, alpha, omega, removed: false}
        this.intervals.push(interval)
        return interval
    }

    public changeIntervalScale(interval: IInterval, factor: number): void {
        interval.scale = percentFromFactor(factorFromPercent(interval.scale) * factor)
        this.fabric.multiply_rest_length(interval.index, factor, 100)
    }

    public removeInterval(interval: IInterval): void {
        this.intervals = this.intervals.filter(existing => existing.index !== interval.index)
        this.eliminateInterval(interval.index)
        interval.removed = true
    }

    public createFace(ends: IJoint[], omni: boolean, spin: Spin, scale: IPercent): IFace {
        const f0 = ends[0]
        const f1 = ends[Math.floor(ends.length / 3)]
        const f2 = ends[Math.floor(2 * ends.length / 3)]
        const index = this.fabric.create_face(f0.index, f1.index, f2.index)
        const pulls = [[f0, f1], [f1, f2], [f2, f0]].reduce((list: IInterval[], pair) => {
            const p = this.intervals.find(intervalJoins(pair[0], pair[1]))
            return p ? [...list, p] : list
        }, [])
        const faceSelection = FaceSelection.None
        const pushes = [expectPush(f0), expectPush(f1), expectPush(f2)]
        const face: IFace = {index, omni, spin, scale, ends, pushes, pulls, faceSelection}
        this.faces.push(face)
        return face
    }

    public removeFace(face: IFace): void {
        face.pulls.forEach(pull => this.removeInterval(pull))
        face.pulls = []
        this.fabric.remove_face(face.index)
        this.faces = this.faces.filter(existing => existing.index !== face.index)
        this.faces.forEach(existing => {
            if (existing.index > face.index) {
                existing.index--
            }
        })
    }

    public get stage(): Stage {
        return this.stage$.getValue()
    }

    public set stage(stage: Stage) {
        this.instance.stage = stage
        if (stage === Stage.Slack) {
            this.instance.snapshot()
        }
        this.stage$.next(stage)
    }

    public do(job: Job): void {
        this.jobs.push(job)
    }

    public iterate(): boolean {
        const busy = this.instance.iterate()
        if (busy) {
            return busy
        }
        const job = this.jobs.shift()
        if (job) {
            job(this)
            return true
        }
        if (this.stage === Stage.Growing) {
            if (this.buds.length > 0) {
                this.buds = execute(this.buds)
                if (this.buds.length === 0) { // last one executed
                    faceStrategies(this.faces, this.tenscript.marks, this.builder).forEach(strategy => strategy.execute())
                }
                return false
            } else if (this.connectors.length > 0) {
                this.connectors = this.builder.checkConnectors(this.connectors, interval => this.removeInterval(interval))
                return false
            }
            this.stage = Stage.Shaping
        }
        return false
    }

    public strainToStiffness(): void {
        new TensegrityOptimizer(this).stiffnessesFromStrains(interval => {
            switch (interval.intervalRole) {
                case IntervalRole.Push:
                case IntervalRole.Pull:
                    return false
                default:
                    const alphaY = jointLocation(interval.alpha).y
                    const omegaY = jointLocation(interval.omega).y
                    const surface = (alphaY + omegaY) < 0.1
                    return !surface
            }
        })
    }

    public findInterval(joint1: IJoint, joint2: IJoint): IInterval | undefined {
        return this.intervals.find(interval => (
            (interval.alpha.index === joint1.index && interval.omega.index === joint2.index) ||
            (interval.alpha.index === joint2.index && interval.omega.index === joint1.index)
        ))
    }

    public getFabricOutput(pushRadius: number, pullRadius: number, jointRadius: number): IFabricOutput {
        this.instance.refreshFloatView()
        const idealLengths = this.instance.floatView.idealLengths
        const strains = this.instance.floatView.strains
        const stiffnesses = this.instance.floatView.stiffnesses
        const linearDensities = this.instance.floatView.linearDensities
        return {
            name: this.tenscript.name,
            joints: this.joints.map(joint => {
                const vector = jointLocation(joint)
                const holes = jointHolesFromJoint(joint, this.intervals)
                return <IOutputJoint>{
                    index: joint.index,
                    radius: jointRadius,
                    x: vector.x, y: vector.z, z: vector.y,
                    anchor: false, // TODO: can this be determined?
                    holes,
                }
            }),
            intervals: this.intervals.map(interval => {
                const isPush = isPushRole(interval.intervalRole)
                const radius = isPush ? pushRadius : pullRadius
                const currentLength = intervalLength(interval)
                const alphaIndex = interval.alpha.index
                const omegaIndex = interval.omega.index
                if (alphaIndex >= this.joints.length || omegaIndex >= this.joints.length) {
                    throw new Error(`Joint not found ${intervalRoleName(interval.intervalRole)}:${alphaIndex},${omegaIndex}:${this.joints.length}`)
                }
                return <IOutputInterval>{
                    index: interval.index,
                    joints: [alphaIndex, omegaIndex],
                    type: isPush ? "Push" : "Pull",
                    strain: strains[interval.index],
                    stiffness: stiffnesses[interval.index],
                    linearDensity: linearDensities[interval.index],
                    role: intervalRoleName(interval.intervalRole),
                    scale: interval.scale._,
                    idealLength: idealLengths[interval.index],
                    isPush,
                    length: currentLength,
                    radius,
                }
            }),
        }
    }

    // =========================

    private creatAxis(alpha: IJoint, omega: IJoint, pullScale?: IPercent): IInterval {
        const idealLength = jointDistance(alpha, omega)
        const intervalRole = pullScale ? IntervalRole.DistancerPull : IntervalRole.ConnectorPull
        const restLength = pullScale ? factorFromPercent(pullScale) * idealLength : CONNECTOR_LENGTH / 2
        const scale = percentOrHundred()
        const countdown = this.numericFeature(WorldFeature.IntervalCountdown) * Math.abs(restLength - idealLength)
        const index = this.fabric.create_interval(alpha.index, omega.index, false, idealLength, restLength, countdown)
        const interval: IInterval = {index, alpha, omega, intervalRole, scale, removed: false}
        this.intervals.push(interval)
        return interval
    }

    private createRay(alpha: IJoint, omega: IJoint, restLength: number): IInterval {
        const idealLength = jointDistance(alpha, omega)
        const intervalRole = IntervalRole.RadialPull
        const scale = percentFromFactor(restLength)
        const countdown = this.numericFeature(WorldFeature.IntervalCountdown) * Math.abs(restLength - idealLength)
        const index = this.fabric.create_interval(alpha.index, omega.index, false, idealLength, restLength, countdown)
        const interval: IInterval = {index, alpha, omega, intervalRole, scale, removed: false}
        this.intervals.push(interval)
        return interval
    }

    private eliminateInterval(index: number): void {
        this.fabric.remove_interval(index)
        this.intervals.forEach(existing => {
            if (existing.index > index) {
                existing.index--
            }
        })
    }
}

function faceStrategies(faces: IFace[], marks: Record<number, IMark>, builder: TensegrityBuilder): FaceStrategy[] {
    const collated: Record<number, IFace[]> = {}
    faces.forEach(face => {
        if (face.mark === undefined) {
            return
        }
        const found = collated[face.mark._]
        if (found) {
            found.push(face)
        } else {
            collated[face.mark._] = [face]
        }
    })
    return Object.entries(collated).map(([key, value]) => {
        const possibleMark = marks[key]
        const mark = possibleMark ? possibleMark :
            value.length === 1 ?
                <IMark>{action: MarkAction.BaseFace} :
                <IMark>{action: MarkAction.JoinFaces}
        return new FaceStrategy(collated[key], mark, builder)
    })
}

class FaceStrategy {
    constructor(private faces: IFace[], private mark: IMark, private builder: TensegrityBuilder) {
    }

    public execute(): void {
        switch (this.mark.action) {
            case MarkAction.Subtree:
                break
            case MarkAction.BaseFace:
                this.builder.faceToOrigin(this.faces[0])
                break
            case MarkAction.JoinFaces:
            case MarkAction.FaceDistance:
                this.builder.createRadialPulls(this.faces, this.mark)
                break
            case MarkAction.Anchor:
                // this.builder.createFaceAnchor(this.faces[0], this.mark)
                break
        }
    }
}

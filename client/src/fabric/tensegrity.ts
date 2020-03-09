/*
 * Copyright (c) 2019. Beautiful Code BV, Rotterdam, Netherlands
 * Licensed under GNU GENERAL PUBLIC LICENSE Version 3.
 */

import { Fabric, FabricFeature, IntervalRole, Stage } from "eig"
import { BehaviorSubject } from "rxjs"
import { BufferGeometry, Float32BufferAttribute, Vector3 } from "three"

import { FrameCapture, IFabricOutput, IOutputInterval, IOutputJoint } from "../storage/download"
import { IStoredState } from "../storage/stored-state"

import { intervalRoleName, isPushInterval } from "./eig-util"
import { FabricInstance } from "./fabric-instance"
import { ITransitionPrefs, Life } from "./life"
import { execute, IActiveTenscript, IMark, ITenscript } from "./tenscript"
import { scaleToFacePullLength, TensegrityBuilder } from "./tensegrity-builder"
import {
    factorToPercent,
    gatherJointCables,
    IBrick,
    IFace,
    IFacePull,
    IInterval,
    IJoint,
    IPercent,
    percentOrHundred,
    percentToFactor,
    Triangle,
    TRIANGLE_DEFINITIONS,
} from "./tensegrity-types"

const COUNTDOWN_MAX = 65535

export class Tensegrity {
    public life$: BehaviorSubject<Life>
    public joints: IJoint[] = []
    public intervals: IInterval[] = []
    public facePulls: IFacePull[] = []
    public faces: IFace[] = []
    public bricks: IBrick[] = []
    public activeTenscript?: IActiveTenscript[]
    public facesToConnect: IFace[] | undefined

    private backup?: Fabric
    private frameCapture?: FrameCapture

    constructor(
        public readonly roleDefaultLength: (intervalRole: IntervalRole) => number,
        public readonly numericFeature: (fabricFeature: FabricFeature) => number,
        public readonly instance: FabricInstance,
        public readonly tenscript: ITenscript,
    ) {
        this.instance.clear()
        this.life$ = new BehaviorSubject(new Life(numericFeature, this, Stage.Growing))
        const brick = new TensegrityBuilder(this).createBrickAt(new Vector3(), percentOrHundred())
        this.bricks = [brick]
        this.activeTenscript = [{tree: this.tenscript.tree, brick, tensegrity: this}]
    }

    public set capture(frameCapture: FrameCapture) {
        console.log(`Capturing ${frameCapture.countdown} frames`)
        this.frameCapture = frameCapture
    }

    public get life(): Life {
        return this.life$.getValue()
    }

    public save(): void {
        this.backup = this.instance.fabric.copy()
    }

    public restore(): void {
        if (!this.backup) {
            throw new Error("No backup")
        }
        this.instance.fabric.restore(this.backup)
    }

    public toStage(stage: Stage, prefs?: ITransitionPrefs): void {
        if (stage === this.life.stage) {
            return
        }
        this.life$.next(this.life.withStage(stage, prefs))
    }

    public connectFaces(faces: IFace[]): void {
        this.facesToConnect = faces
    }

    public createLeftJoint(location: Vector3): number {
        return this.instance.fabric.create_joint(location.x, location.y, location.z)
    }

    public createFacePull(alpha: IFace, omega: IFace): IFacePull {
        const actualLength = alpha.location().distanceTo(omega.location())
        const stiffness = scaleToStiffness(percentOrHundred())
        const scaleFactor = (percentToFactor(alpha.brick.scale) + percentToFactor(omega.brick.scale)) / 2
        const restLength = scaleToFacePullLength(scaleFactor)
        const index = this.instance.fabric.create_interval(
            alpha.index, omega.index, IntervalRole.FacePull,
            actualLength, restLength, stiffness, facePullCountdown(actualLength),
        )
        const facePull = {index, alpha, omega, distance: actualLength, scaleFactor, removed: false}
        this.facePulls.push(facePull)
        return facePull
    }

    public removeFacePull(facePull: IFacePull): void {
        this.facePulls = this.facePulls.filter(existing => existing.index !== facePull.index)
        this.instance.fabric.remove_interval(facePull.index)
        this.facePulls.forEach(existing => {
            if (existing.index > facePull.index) {
                existing.index--
            }
        })
        this.intervals.forEach(existing => {
            if (existing.index > facePull.index) {
                existing.index--
            }
        })
        facePull.removed = true
    }

    public createInterval(alpha: IJoint, omega: IJoint, intervalRole: IntervalRole, scale: IPercent, coundown: number): IInterval {
        const idealLength = alpha.location().distanceTo(omega.location())
        const scaleFactor = percentToFactor(scale)
        const defaultLength = this.roleDefaultLength(intervalRole)
        const restLength = scaleFactor * defaultLength
        const stiffness = scaleToStiffness(scale)
        const index = this.instance.fabric.create_interval(
            alpha.index, omega.index, intervalRole,
            idealLength, restLength, stiffness, coundown)
        const interval: IInterval = {
            index,
            intervalRole,
            scale,
            alpha,
            omega,
            removed: false,
            isPush: isPushInterval(intervalRole),
            location: () => new Vector3().addVectors(alpha.location(), omega.location()).multiplyScalar(0.5),
        }
        this.intervals.push(interval)
        return interval
    }

    public changeIntervalScale(interval: IInterval, factor: number): void {
        interval.scale = factorToPercent(percentToFactor(interval.scale) * factor)
        this.instance.fabric.multiply_rest_length(interval.index, factor, 100)
    }

    public changeIntervalRole(interval: IInterval, intervalRole: IntervalRole, scaleFactor: IPercent, countdown: number): void {
        interval.intervalRole = intervalRole
        this.instance.fabric.set_interval_role(interval.index, intervalRole)
        this.instance.fabric.change_rest_length(interval.index, percentToFactor(scaleFactor) * this.roleDefaultLength(intervalRole), countdown)
    }

    public removeInterval(interval: IInterval): void {
        this.intervals = this.intervals.filter(existing => existing.index !== interval.index)
        this.instance.fabric.remove_interval(interval.index)
        this.intervals.forEach(existing => {
            if (existing.index > interval.index) {
                existing.index--
            }
        })
        this.facePulls.forEach(existing => {
            if (existing.index > interval.index) {
                existing.index--
            }
        })
        interval.removed = true
    }

    public createFace(brick: IBrick, triangle: Triangle): IFace {
        const {negative, pushEnds} = TRIANGLE_DEFINITIONS[triangle]
        const pushes = pushEnds.map(end => {
            const foundPush = brick.pushes.find(push => {
                const endJoint = brick.joints[end]
                return endJoint.index === push.alpha.index || endJoint.index === push.omega.index
            })
            if (foundPush === undefined) {
                throw new Error()
            }
            return foundPush
        })
        const pulls = [0, 1, 2].map(offset => brick.pulls[triangle * 3 + offset])
        const joints = pushEnds.map(end => brick.joints[end])
        const index = this.instance.fabric.create_face(joints[0].index, joints[1].index, joints[2].index)
        const face: IFace = {
            index, negative, removed: false,
            brick, triangle, joints, pushes, pulls,
            location: () =>
                joints.reduce((sum, joint) => sum.add(joint.location()), new Vector3())
                    .multiplyScalar(1.0 / 3.0),
        }
        this.faces.push(face)
        return face
    }

    public removeFace(face: IFace, removeIntervals: boolean): void {
        this.instance.fabric.remove_face(face.index)
        this.faces = this.faces.filter(existing => existing.index !== face.index)
        this.faces.forEach(existing => {
            if (existing.index > face.index) {
                existing.index--
            }
        })
        this.facePulls.forEach(existing => {
            if (existing.alpha.index > face.index) {
                existing.alpha.index--
            }
            if (existing.omega.index > face.index) {
                existing.omega.index--
            }
        })
        face.removed = true
        if (removeIntervals) {
            face.pulls.forEach(interval => this.removeInterval(interval))
        }
    }

    public get submergedJoints(): IJoint[] {
        return this.joints.filter(joint => joint.location().y < 0)
    }

    public get facesGeometry(): BufferGeometry {
        const faceLocations = new Float32BufferAttribute(this.instance.floatView.faceLocations, 3)
        const faceNormals = new Float32BufferAttribute(this.instance.floatView.faceNormals, 3)
        const geometry = new BufferGeometry()
        geometry.addAttribute("position", faceLocations)
        geometry.addAttribute("normal", faceNormals)
        geometry.computeBoundingSphere()
        return geometry
    }

    public get linesGeometry(): BufferGeometry {
        const lineLocations = new Float32BufferAttribute(this.instance.floatView.lineLocations, 3)
        const lineColors = new Float32BufferAttribute(this.instance.floatView.lineColors, 3)
        const geometry = new BufferGeometry()
        geometry.addAttribute("position", lineLocations)
        geometry.addAttribute("color", lineColors)
        geometry.computeBoundingSphere()
        return geometry
    }

    public startTightening(facePulls: IFacePull[]): void {
        this.facePulls = facePulls
    }

    public iterate(): Stage {
        const lifePhase = this.instance.iterate(this.life$.getValue().stage)
        if (this.frameCapture) {
            if (!this.frameCapture.captureFrame(this.getFrame(this.frameCapture.storedState))) {
                console.log("Finished frame capture")
                this.frameCapture.save()
                this.frameCapture = undefined
            }
        }
        if (lifePhase === Stage.Busy) {
            return lifePhase
        }
        const activeCode = this.activeTenscript
        const builder = () => new TensegrityBuilder(this)
        if (activeCode) {
            if (activeCode.length > 0) {
                this.activeTenscript = execute(activeCode, this.tenscript.marks)
                this.instance.fabric.centralize()
            }
            if (activeCode.length === 0) {
                this.activeTenscript = undefined
                faceStrategies(this.faces, this.tenscript.marks, builder()).forEach(strategy => strategy.execute())
                if (lifePhase === Stage.Growing) {
                    return this.instance.fabric.finish_growing()
                }
            }
            return Stage.Growing
        }
        const faces = this.facesToConnect
        if (faces) {
            this.facesToConnect = undefined
            builder().createFacePulls(faces)
        }
        if (this.facePulls.length > 0) {
            this.facePulls = builder().checkFacePulls(this.facePulls, facePull => this.removeFacePull(facePull))
        }
        return lifePhase
    }

    public findInterval(joint1: IJoint, joint2: IJoint): IInterval | undefined {
        return this.intervals.find(interval => (
            (interval.alpha.index === joint1.index && interval.omega.index === joint2.index) ||
            (interval.alpha.index === joint2.index && interval.omega.index === joint1.index)
        ))
    }

    public getFabricOutput(storedState: IStoredState): IFabricOutput {
        const idealLengths = this.instance.floatView.idealLengths
        const strains = this.instance.floatView.strains
        const stiffnesses = this.instance.floatView.stiffnesses
        const linearDensities = this.instance.floatView.linearDensities
        return {
            name: this.tenscript.name,
            joints: this.joints.map(joint => {
                const vector = joint.location()
                return <IOutputJoint>{
                    index: joint.index,
                    x: vector.x, y: vector.z, z: vector.y,
                    jointCables: gatherJointCables(joint, this.intervals),
                }
            }),
            intervals: this.intervals.map(interval => {
                const radiusFeature = storedState.featureValues[interval.isPush ? FabricFeature.PushRadius : FabricFeature.PullRadius]
                const radius = radiusFeature.numeric * linearDensities[interval.index]
                const jointRadius = radius * storedState.featureValues[FabricFeature.JointRadius].numeric
                const currentLength = interval.alpha.location().distanceTo(interval.omega.location())
                const length = currentLength + (interval.isPush ? -jointRadius * 2 : jointRadius * 2)
                return <IOutputInterval>{
                    index: interval.index,
                    joints: [interval.alpha.index, interval.omega.index],
                    type: interval.isPush ? "Push" : "Pull",
                    strain: strains[interval.index],
                    stiffness: stiffnesses[interval.index],
                    linearDensity: linearDensities[interval.index],
                    role: intervalRoleName(interval.intervalRole),
                    idealLength: idealLengths[interval.index],
                    isPush: interval.isPush,
                    length, radius, jointRadius,
                }
            }),
        }
    }

    public getFrame(storedState: IStoredState): object {
        const linearDensities = this.instance.floatView.linearDensities
        return {
            name: this.tenscript.name,
            joints: this.joints.map(joint => {
                const vector = joint.location()
                return {
                    index: joint.index,
                    x: vector.x, y: vector.z, z: vector.y,
                }
            }),
            intervals: this.intervals.map(interval => {
                const radiusFeature = storedState.featureValues[interval.isPush ? FabricFeature.PushRadius : FabricFeature.PullRadius]
                const radius = radiusFeature.numeric * linearDensities[interval.index]
                const jointRadius = radius * storedState.featureValues[FabricFeature.JointRadius].numeric
                const currentLength = interval.alpha.location().distanceTo(interval.omega.location())
                const length = currentLength + (interval.isPush ? -jointRadius * 2 : jointRadius * 2)
                return <IOutputInterval>{
                    index: interval.index,
                    joints: [interval.alpha.index, interval.omega.index],
                    type: interval.isPush ? "Push" : "Pull",
                    role: intervalRoleName(interval.intervalRole),
                    isPush: interval.isPush,
                    length, radius, jointRadius,
                }
            }),
        }
    }
}

function facePullCountdown(distance: number): number {
    const countdown = distance * 6000
    return countdown > COUNTDOWN_MAX ? COUNTDOWN_MAX : countdown
}

function scaleToStiffness(scale: IPercent): number {
    return percentToFactor(scale) / 10000
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
            value.length === 1 ? <IMark>{action: "base-face"} : <IMark>{action: "join-faces"}
        return new FaceStrategy(collated[key], mark, builder)
    })
}

class FaceStrategy {
    constructor(private faces: IFace[], private mark: IMark, private builder: TensegrityBuilder) {
    }

    public execute(): void {
        switch (this.mark.action) {
            case "subtree":
                break
            case "base-face":
                this.builder.uprightAtOrigin(this.faces[0])
                break
            case "join-faces":
                this.builder.createFacePulls(this.faces)
                break
        }
    }
}

/*
 * Copyright (c) 2019. Beautiful Code BV, Rotterdam, Netherlands
 * Licensed under GNU GENERAL PUBLIC LICENSE Version 3.
 */

import * as FileSaver from "file-saver"
import JSZip from "jszip"

import { Tensegrity } from "../fabric/tensegrity"
import { IJointCable } from "../fabric/tensegrity-types"

import { IStoredState } from "./stored-state"

function csvNumber(n: number): string {
    return n.toFixed(5).replace(/[.]/, ",")
}

function dateString(): string {
    return new Date().toISOString()
        .replace(/[.].*/, "").replace(/[:T_]/g, "-")
}

export interface IOutputJoint {
    index: number
    x: number
    y: number
    z: number
    jointCables: IJointCable[]
}

export interface IOutputInterval {
    index: number
    joints: number[]
    type: string
    strain: number
    stiffness: number
    linearDensity: number
    isPush: boolean
    role: string
    idealLength: number
    length: number
    radius: number
    jointRadius: number
}

export interface IFabricOutput {
    name: string
    joints: IOutputJoint[]
    intervals: IOutputInterval[]
}

function extractJointFile(output: IFabricOutput): string {
    const csvJoints: string[][] = []
    csvJoints.push(["index", "x", "y", "z"])
    output.joints.forEach(joint => csvJoints.push([
        (joint.index + 1).toFixed(0),
        csvNumber(joint.x), csvNumber(joint.y), csvNumber(joint.z),
    ]))
    return csvJoints.map(a => a.join(";")).join("\n")
}

function extractIntervalFile(output: IFabricOutput): string {
    const csvIntervals: string[][] = []
    csvIntervals.push(["joints", "type", "strain", "stiffness", "linear density", "role", "length"])
    output.intervals.forEach(interval => {
        csvIntervals.push([
            `"=""${interval.joints.map(j => (j + 1).toFixed(0))}"""`, interval.type,
            csvNumber(interval.strain), csvNumber(interval.stiffness), csvNumber(interval.linearDensity),
            interval.role, interval.length.toFixed(8),
        ])
    })
    return csvIntervals.map(a => a.join(";")).join("\n")
}

function extractSubmergedFile(tensegrity: Tensegrity): string {
    const csvSubmerged: string[][] = []
    csvSubmerged.push(["joints"])
    csvSubmerged.push([`"=""${tensegrity.submergedJoints.map(joint => joint.index + 1)}"""`])
    return csvSubmerged.map(a => a.join(";")).join("\n")
}

export function saveCSVZip(tensegrity: Tensegrity, storedState: IStoredState): void {
    const output = tensegrity.getFabricOutput(storedState)
    const zip = new JSZip()
    zip.file("joints.csv", extractJointFile(output))
    zip.file("intervals.csv", extractIntervalFile(output))
    zip.file("submerged.csv", extractSubmergedFile(tensegrity))
    zip.generateAsync({type: "blob", mimeType: "application/zip"}).then(blob => {
        FileSaver.saveAs(blob, `pretenst-${dateString()}.zip`)
    })
}

export function saveJSONZip(tensegrity: Tensegrity, storedState: IStoredState): void {
    const output = tensegrity.getFabricOutput(storedState)
    const zip = new JSZip()
    zip.file(`pretenst-${dateString()}.json`, JSON.stringify(output, undefined, 2))
    zip.generateAsync({type: "blob", mimeType: "application/zip"}).then(blob => {
        FileSaver.saveAs(blob, `pretenst-${dateString()}.zip`)
    })
}

export class FrameCapture {
    public jsonFrames: string[] = []

    public constructor(public storedState: IStoredState, public countdown: number) {
    }

    public captureFrame(frame: object): boolean {
        this.jsonFrames.push(JSON.stringify(frame))
        this.countdown--
        return this.countdown > 0
    }

    public save(): void {
        const zip = new JSZip()
        this.jsonFrames.forEach((json, index) => zip.file(`pretenst-frame-${index}.json`, json))
        zip.generateAsync({type: "blob", mimeType: "application/zip"}).then(blob => {
            FileSaver.saveAs(blob, `pretenst-frames-${dateString()}.zip`)
        })
    }
}

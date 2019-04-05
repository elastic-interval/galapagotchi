/*
 * Copyright (c) 2019. Beautiful Code BV, Rotterdam, Netherlands
 * Licensed under GNU GENERAL PUBLIC LICENSE Version 3.
 */

import * as React from "react"
import * as R3 from "react-three"
import { BufferGeometry, Float32BufferAttribute, Vector3 } from "three"

import { HUNG_ALTITUDE } from "../body/fabric"
import { Journey } from "../island/journey"

import { JOURNEY } from "./materials"

export interface IJourneyProps {
    journey: Journey
}

export class JourneyComponent extends React.Component<IJourneyProps, object> {
    private geometry: BufferGeometry

    constructor(props: IJourneyProps) {
        super(props)
        this.state = {}
        this.geometry = JourneyComponent.createGeometry(props)
    }

    public componentWillReceiveProps(nextProps: IJourneyProps): void {
        // todo: detect change!
        console.log("next props", nextProps.journey)
        this.geometry.dispose()
        this.geometry = JourneyComponent.createGeometry(nextProps)
    }

    public componentWillUnmount(): void {
        this.geometry.dispose()
    }

    public render(): JSX.Element {
        return <R3.LineSegments key="Journey" geometry={this.geometry} material={JOURNEY}/>
    }

    private static createGeometry(props: IJourneyProps): BufferGeometry {
        const journey = props.journey
        const arrows = journey.visits.length - 1
        const pointsPerArrow = 18
        const positions = new Float32Array(arrows * pointsPerArrow)
        const forward = new Vector3()
        const up = new Vector3(0, 1, 0)
        const right = new Vector3()
        for (let walk = 0; walk < arrows; walk++) {
            const from = new Vector3().add(journey.visits[walk].center)
            const to = new Vector3().add(journey.visits[walk + 1].center)
            forward.subVectors(to, from)
            right.crossVectors(up, forward)
            to.addScaledVector(forward, -0.1)
            right.normalize()
            forward.normalize().multiplyScalar(4)
            let offset = walk * pointsPerArrow
            // main shaft
            positions[offset++] = from.x
            positions[offset++] = HUNG_ALTITUDE
            positions[offset++] = from.z
            positions[offset++] = to.x
            positions[offset++] = HUNG_ALTITUDE
            positions[offset++] = to.z
            // arrow right side
            positions[offset++] = to.x - right.x - forward.x
            positions[offset++] = HUNG_ALTITUDE
            positions[offset++] = to.z - right.z - forward.z
            positions[offset++] = to.x
            positions[offset++] = HUNG_ALTITUDE
            positions[offset++] = to.z
            // arrow left side
            positions[offset++] = to.x + right.x - forward.x
            positions[offset++] = HUNG_ALTITUDE
            positions[offset++] = to.z + right.z - forward.z
            positions[offset++] = to.x
            positions[offset++] = HUNG_ALTITUDE
            positions[offset++] = to.z
        }
        const geometry = new BufferGeometry()
        geometry.addAttribute("position", new Float32BufferAttribute(positions, 3))
        return geometry
    }
}

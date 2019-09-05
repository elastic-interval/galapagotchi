/*
 * Copyright (c) 2019. Beautiful Code BV, Rotterdam, Netherlands
 * Licensed under GNU GENERAL PUBLIC LICENSE Version 3.
 */

import * as React from "react"
import { useEffect, useRef, useState } from "react"
import { Canvas, CanvasContext, extend, ReactThreeFiber, useRender, useThree } from "react-three-fiber"
import { Mesh, PerspectiveCamera, Raycaster, Scene, SphereGeometry, Vector2, Vector3 } from "three"
import { OrbitControls } from "three/examples/jsm/controls/OrbitControls"

import { IFabricExports } from "../fabric/fabric-exports"
import { createFabricKernel } from "../fabric/fabric-kernel"
import { Physics } from "../fabric/physics"
import { IFace, Joint } from "../fabric/tensegrity-brick"
import { TensegrityFabric } from "../fabric/tensegrity-fabric"
import { MAX_POPULATION } from "../gotchi/evolution"

import { Flight } from "./flight"
import { TensegrityFlightState } from "./flight-state"
import {
    TENSEGRITY_FACE,
    TENSEGRITY_JOINT,
    TENSEGRITY_JOINT_CAN_GROW,
    TENSEGRITY_JOINT_SELECTED,
    TENSEGRITY_LINE,
} from "./materials"
import { PhysicsPanel } from "./physics-panel"
import { SurfaceComponent } from "./surface-component"

extend({OrbitControls})

declare global {
    namespace JSX {
        // tslint:disable-next-line:interface-name
        interface IntrinsicElements {
            orbitControls: ReactThreeFiber.Object3DNode<OrbitControls, typeof OrbitControls>
        }
    }
}

export function TensegrityView({fabricExports}: { fabricExports: IFabricExports }): JSX.Element {
    const physics = new Physics()
    physics.applyGlobal(fabricExports)
    const fabricKernel = createFabricKernel(fabricExports, MAX_POPULATION, 500)
    const fabric = fabricKernel.createTensegrityFabric()
    if (!fabric) {
        throw new Error()
    }
    if (fabric) {
        fabric.applyPhysics(physics)
        fabric.createBrick()
    }
    return (
        <div className="the-whole-page">
            <Canvas>
                <FabricView fabric={fabric}/>
            </Canvas>
            <PhysicsPanel
                physics={physics}
                fabricExports={fabricExports}
                fabricInstanceExports={fabric.exports}
            />
        </div>
    )
}

function FabricView({fabric}: { fabric: TensegrityFabric }): JSX.Element {
    const sphereGeometry = new SphereGeometry(0.2, 16, 16)
    const rayCaster = new Raycaster()
    const [time, setTime] = useState<number>(0)
    const [holdFace, setHoldFace] = useState<React.MouseEvent<HTMLDivElement> | undefined>()
    const [selectedFace, setSelectedFace] = useState<IFace | undefined>()
    const [dragJoint, setDragJoint] = useState<number | undefined>()
    const [selectedJoint, setSelectedJoint] = useState<number | undefined>()
    const scene = useRef<Scene>()
    const camera = useRef<PerspectiveCamera>()
    const controls = useRef<OrbitControls>()
    const triangleMesh = useRef<Mesh>()
    const {size, setDefaultCamera} = useThree()
    const flightState = TensegrityFlightState(fabric)
    let flight: Flight | undefined
    useEffect(() => {
        if (camera.current) {
            setDefaultCamera(camera.current)
        }
    }, [])
    useRender(({gl, canvas}: CanvasContext, timestamp: number) => {
        if (flight) {
            flight.update()
            flight.moveTowardsTarget(flightState.target)
        } else if (controls.current && camera.current) {
            flight = new Flight(controls.current)
            flight.setupCamera(flightState)
            flight.enabled = true
        }
        fabric.iterate(30)
        setTime(timestamp)
    })
    if (!time) {
        console.log("time", time)
    }
    const root = document.getElementById("root") as HTMLElement
    const findFace = (event: React.MouseEvent<HTMLDivElement>) => {
        const mouse = new Vector2((event.clientX / size.width) * 2 - 1, -(event.clientY / size.height) * 2 + 1)
        if (!(camera.current && triangleMesh.current)) {
            return
        }
        rayCaster.setFromCamera(mouse, camera.current)
        const intersections = rayCaster.intersectObjects([triangleMesh.current], true)
            .filter(i => i.faceIndex !== undefined)
        const faces = intersections.map(intersection => {
            const triangleIndex = intersection.faceIndex ? intersection.faceIndex : 0
            return fabric.findFace(triangleIndex)
        })
        const cameraPosition = camera.current.position
        const midpoint = (face: IFace): Vector3 => {
            return face.joints.reduce((mid: Vector3, joint: Joint) =>
                mid.add(fabric.getJointLocation(joint)), new Vector3()).multiplyScalar(1.0 / 3.0)
        }
        faces.sort((a: IFace, b: IFace) => {
            const toA = cameraPosition.distanceToSquared(midpoint(a))
            const toB = cameraPosition.distanceToSquared(midpoint(b))
            return toA < toB ? 1 : toA > toB ? -1 : 0
        })
        return faces.pop()
    }
    const facePointerUp = () => {
        const face = holdFace ? findFace(holdFace) : undefined
        if (face) {
            if (!selectedFace || face.index !== selectedFace.index) {
                setSelectedFace(face)
            } else if (selectedFace.canGrow) {
                const brick = fabric.growBrick(selectedFace.brick, selectedFace.triangle)
                fabric.connectBricks(selectedFace.brick, selectedFace.triangle, brick, brick.base)
                setSelectedJoint(undefined)
                setSelectedFace(undefined)
            }
        }
    }
    const facePointerDown = (event: React.MouseEvent<HTMLDivElement>) => {
        setSelectedJoint(undefined)
        setHoldFace(event)
    }
    const sceneRelease = () => {
        const currentControls = controls.current
        if (currentControls) {
            currentControls.enabled = true
        }
        setDragJoint(undefined)
    }
    const scenePointerMove = (event: React.MouseEvent<HTMLDivElement>) => {
        if (holdFace) {
            setHoldFace(undefined)
        }
        if (selectedJoint !== undefined && dragJoint !== undefined && event.movementY) {
            const changeSpan = (movement: number, bar: boolean) => {
                if (movement === 0) {
                    return
                }
                const factor = 1.0 + 0.001 * movement
                fabric.multiplyAdjacentIdealSpan(selectedJoint, bar, factor)
            }
            changeSpan(-event.movementY, false)
            changeSpan(event.movementX, true)
        }
    }
    const selectedJointDown = (event: React.MouseEvent<HTMLDivElement>, joint: Joint) => {
        event.stopPropagation()
        const currentControls = controls.current
        if (currentControls) {
            currentControls.enabled = false
        }
        setDragJoint(joint)
    }
    const selectedJointClick = (event: React.MouseEvent<HTMLDivElement>) => {
        event.stopPropagation()
        setSelectedJoint(undefined)
    }
    return (
        <group>
            <perspectiveCamera ref={camera}/>
            {camera.current && (
                <>
                    <orbitControls
                        ref={controls}
                        args={[camera.current, root]}
                        panSpeed={2.0}
                        rotateSpeed={0.5}
                    />
                    <scene
                        ref={scene}
                        onPointerUp={sceneRelease}
                        onPointerOut={sceneRelease}
                        onPointerMove={scenePointerMove}
                    >
                        {fabric.isGestating ? undefined : (
                            <mesh
                                key="Triangles"
                                ref={triangleMesh}
                                geometry={fabric.facesGeometry}
                                material={TENSEGRITY_FACE}
                                onPointerDown={facePointerDown}
                                onPointerUp={facePointerUp}
                            />
                        )}
                        {!selectedFace ? (
                            selectedJoint === undefined ? undefined : (
                                <mesh
                                    key={`J${selectedJoint}`}
                                    geometry={sphereGeometry}
                                    position={fabric.getJointLocation(selectedJoint)}
                                    material={TENSEGRITY_JOINT_SELECTED}
                                    onPointerDown={event => selectedJointDown(event, selectedJoint)}
                                    onClick={selectedJointClick}
                                />
                            )
                        ) : (
                            selectedFace.joints.map(jointIndex => (
                                <mesh
                                    key={`J${jointIndex}`}
                                    geometry={sphereGeometry}
                                    position={fabric.getJointLocation(jointIndex)}
                                    material={selectedFace.canGrow ? TENSEGRITY_JOINT_CAN_GROW : TENSEGRITY_JOINT}
                                    onClick={() => {
                                        setSelectedJoint(jointIndex)
                                        setSelectedFace(undefined)
                                    }}
                                    onPointerDown={event => event.stopPropagation()}
                                    onPointerUp={event => event.stopPropagation()}
                                />
                            )))}
                        <lineSegments
                            key="Lines"
                            geometry={fabric.linesGeometry}
                            material={TENSEGRITY_LINE}/>
                        <SurfaceComponent/>
                    </scene>
                </>
            )}
        </group>
    )
}
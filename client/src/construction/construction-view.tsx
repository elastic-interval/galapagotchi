/*
 * Copyright (c) 2021. Beautiful Code BV, Rotterdam, Netherlands
 * Licensed under GNU GENERAL PUBLIC LICENSE Version 3.
 */

import { default_world_feature, SurfaceCharacter, WorldFeature } from "eig"
import * as React from "react"
import { useEffect, useMemo, useRef, useState } from "react"
import { FaPlay } from "react-icons/all"
import { Canvas, useFrame, useThree } from "react-three-fiber"
import { useRecoilBridgeAcrossReactRoots_UNSTABLE, useRecoilState, useSetRecoilState } from "recoil"
import { PerspectiveCamera, Vector3 } from "three"

import { GlobalMode } from "../fabric/eig-util"
import { CreateInstance } from "../fabric/fabric-instance"
import { compileTenscript, ITenscript, RunTenscript } from "../fabric/tenscript"
import { PostGrowthOp, Tensegrity } from "../fabric/tensegrity"
import { IInterval, IIntervalDetails, Spin } from "../fabric/tensegrity-types"
import { postGrowthAtom, ViewMode, viewModeAtom } from "../storage/recoil"
import { BottomLeft } from "../view/bottom-left"
import { BottomRight } from "../view/bottom-right"

import { ObjectView } from "./object-view"


export function ConstructionView({globalMode, createInstance}: {
    globalMode: GlobalMode,
    createInstance: CreateInstance,
}): JSX.Element {
    const mainInstance = useMemo(() => createInstance(SurfaceCharacter.Frozen, tenscriptFor(globalMode).featureValues), [])
    const [tensegrity, setTensegrity] = useState<Tensegrity | undefined>()
    const [viewMode, setViewMode] = useRecoilState(viewModeAtom)
    const [selected, setSelected] = useState<IInterval | undefined>()
    const [details, setDetails] = useState<IIntervalDetails | undefined>(undefined)
    const setPostGrowth = useSetRecoilState(postGrowthAtom)
    const emergency = (message: string) => console.error("build view", message)

    const createTensegrity: RunTenscript = (ts: ITenscript, error: (message: string) => void) => {
        try {
            const tree = compileTenscript(ts, error)
            if (!tree) {
                return false
            }
            setViewMode(ViewMode.Lines)
            setPostGrowth(ts.postGrowthOp)
            const localValue = ts.featureValues[WorldFeature.IntervalCountdown]
            const countdown = localValue === undefined ? default_world_feature(WorldFeature.IntervalCountdown) : localValue
            setTensegrity(new Tensegrity(new Vector3(), mainInstance, countdown, ts, tree))
        } catch (e) {
            throw new Error("Problem running")
        }
        return true
    }
    useEffect(() => {
        createTensegrity(tenscriptFor(globalMode), emergency)
    }, [])
    useEffect(() => {
        if (tensegrity) {
            if (selected) {
                setDetails(tensegrity.getIntervalDetails(selected))
            } else {
                setDetails(undefined)
            }
        }
    }, [selected])

    const RecoilBridge = useRecoilBridgeAcrossReactRoots_UNSTABLE()
    return (
        <div style={{
            position: "absolute",
            left: 0,
            right: 0,
            height: "100%",
        }}>
            {!tensegrity ? (
                <div className="h-100">
                    <div style={{position: "relative", top: "50%", left: "50%"}}>
                        <h1><FaPlay/></h1>
                    </div>
                </div>
            ) : (
                <div className="h-100">
                    <Canvas
                        style={{
                            backgroundColor: "black",
                            borderStyle: "solid",
                            borderColor: viewMode !== ViewMode.Lines ? "#f0ad4e" : "black",
                            cursor: viewMode === ViewMode.Selecting ? "pointer" : "default",
                            borderWidth: "2px",
                        }}
                    >
                        <ObjectCamera/>
                        <RecoilBridge>
                            <ObjectView
                                tensegrity={tensegrity}
                                selected={selected}
                                setSelected={setSelected}
                                details={details}
                            />
                        </RecoilBridge>
                    </Canvas>
                    <div id="bottom-left">
                        <BottomLeft/>
                    </div>
                    <div id="bottom-right">
                        <BottomRight tensegrity={tensegrity}/>
                    </div>
                </div>
            )}
        </div>
    )
}

function ObjectCamera(props: object): JSX.Element {
    const ref = useRef<PerspectiveCamera>()
    const {setDefaultCamera} = useThree()
    // Make the camera known to the system
    useEffect(() => {
        const camera = ref.current
        if (!camera) {
            throw new Error("No camera")
        }
        camera.fov = 50
        camera.position.set(0, 6, 18)
        setDefaultCamera(camera)
    }, [])
    // Update it every frame
    useFrame(() => {
        const camera = ref.current
        if (!camera) {
            throw new Error("No camera")
        }
        camera.updateMatrixWorld()
    })
    return <perspectiveCamera ref={ref} {...props} />
}

export function tenscriptFor(globalMode: GlobalMode): ITenscript {
    switch (globalMode) {
        case GlobalMode.Halo:
            return {
                name: "Halo by Crane",
                spin: Spin.Left,
                postGrowthOp: PostGrowthOp.BowtieFaces,
                surfaceCharacter: SurfaceCharacter.Frozen,
                code: ["(5,S89,b(12,S92,MA1),d(11,S92,MA1))"],
                markDefStrings: {
                    1: "join",
                },
                featureValues: {
                    [WorldFeature.IterationsPerFrame]: 1000,
                    [WorldFeature.Drag]: 300,
                    [WorldFeature.PushOverPull]: 800,
                    [WorldFeature.PretenstFactor]: 30,
                    [WorldFeature.Gravity]: 50,
                },
            }
        case GlobalMode.Convergence:
            return {
                name: "Convergence",
                spin: Spin.LeftRight,
                postGrowthOp: PostGrowthOp.Bowtie,
                surfaceCharacter: SurfaceCharacter.Frozen,
                code: ["(a2,b(10,S90,MA1),c(10,S90,MA1),d(10,S90,MA1))"],
                markDefStrings: {
                    1: "join",
                },
                featureValues: {
                    [WorldFeature.Drag]: 300,
                    [WorldFeature.PushOverPull]: 800,
                    [WorldFeature.PretenstFactor]: 30,
                    [WorldFeature.StiffnessFactor]: 150,
                    [WorldFeature.IterationsPerFrame]: 1000,
                },
            }
        case GlobalMode.HeadlessHug:
            return {
                name: "Headless Hug",
                spin: Spin.LeftRight,
                postGrowthOp: PostGrowthOp.BowtieFaces,
                surfaceCharacter: SurfaceCharacter.Bouncy,
                code: [
                    "(",
                    "A(OOOOOOO,S92,MA1),",
                    "b(OOOOOOO,S92,MA1),",
                    "a(3,C(OOOOOOO,S93,MA3),S90,MA2),",
                    "B(3,C(OOOOOOO,S93,MA3),S90,MA2)",
                    ")",
                ],
                featureValues: {
                    [WorldFeature.Gravity]: 10,
                    [WorldFeature.IterationsPerFrame]: 1000,
                },
                markDefStrings: {
                    "1": "distance-20",
                    "2": "distance-10",
                    "3": "distance-10",
                },
            }
        default:
            throw new Error("tenscript?")
    }
}

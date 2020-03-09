/*
 * Copyright (c) 2019. Beautiful Code BV, Rotterdam, Netherlands
 * Licensed under GNU GENERAL PUBLIC LICENSE Version 3.
 */

import { FabricFeature, IntervalRole, Stage } from "eig"
import * as React from "react"
import { useEffect, useMemo, useState } from "react"
import { FaArrowRight, FaCamera, FaHandPointUp, FaPlay, FaSyncAlt, FaToolbox } from "react-icons/all"
import { Canvas } from "react-three-fiber"
import { Button, ButtonGroup } from "reactstrap"
import { BehaviorSubject } from "rxjs"

import { ADJUSTABLE_INTERVAL_ROLES, fabricFeatureIntervalRole } from "../fabric/eig-util"
import { FloatFeature } from "../fabric/fabric-features"
import { FabricInstance } from "../fabric/fabric-instance"
import { BOOTSTRAP, getCodeFromUrl, ITenscript } from "../fabric/tenscript"
import { Tensegrity } from "../fabric/tensegrity"
import { IFace, IInterval, percentToFactor } from "../fabric/tensegrity-types"
import { FrameCapture } from "../storage/download"
import {
    getRecentTenscript,
    IFeatureValue,
    IStoredState,
    roleDefaultFromFeatures,
    transition,
} from "../storage/stored-state"

import { ControlTabs } from "./control-tabs"
import { FabricView } from "./fabric-view"
import { ShapeSelection } from "./shape-tab"

const SPLIT_LEFT = "25em"
const SPLIT_RIGHT = "26em"

function getCodeToRun(state: IStoredState): ITenscript {
    const fromUrl = getCodeFromUrl()
    if (fromUrl) {
        return fromUrl
    }
    const recentCode = getRecentTenscript(state)
    return recentCode.length > 0 ? recentCode[0] : BOOTSTRAP[0]
}

function selectIntervals(faces: IFace[]): IInterval[] {
    return faces.reduce((accum, face) => {
        const unknown = (interval: IInterval) => !accum.some(existing => interval.index === existing.index)
        const pulls = face.pulls.filter(unknown)
        const pushes = face.pushes.filter(unknown)
        return [...accum, ...pushes, ...pulls]
    }, [] as IInterval[])
}

export function TensegrityView({eig, floatFeatures, storedState$}: {
    eig: typeof import("eig"),
    floatFeatures: Record<FabricFeature, FloatFeature>,
    storedState$: BehaviorSubject<IStoredState>,
}): JSX.Element {

    const mainInstance = useMemo(() => new FabricInstance(eig, 100), [])

    const [tensegrity, setTensegrity] = useState<Tensegrity | undefined>()
    const [selectedIntervals, setSelectedIntervals] = useState<IInterval[]>([])
    const [selectedFaces, setSelectedFaces] = useState<IFace[]>([])
    useEffect(() => setSelectedIntervals(selectIntervals(selectedFaces)), [selectedFaces])

    const [rootTenscript, setRootTenscript] = useState(() => getCodeToRun(storedState$.getValue()))
    useEffect(() => {
        if (location.hash.length === 0) {
            location.hash = rootTenscript.code
        }
    }, [rootTenscript])

    const [visibleRoles, setVisibleRoles] = useState(ADJUSTABLE_INTERVAL_ROLES)
    const [rotating, updateRotating] = useState(storedState$.getValue().rotating)
    const [shapeSelection, setShapeSelection] = useState(ShapeSelection.None)
    const [fullScreen, updateFullScreen] = useState(storedState$.getValue().fullScreen)
    const [ellipsoids, updateEllipsoids] = useState(storedState$.getValue().ellipsoids)
    useEffect(() => setVisibleRoles(ADJUSTABLE_INTERVAL_ROLES), [ellipsoids])
    useEffect(() => {
        const subscription = storedState$.subscribe(storedState => {
            updateFullScreen(storedState.fullScreen)
            updateEllipsoids(storedState.ellipsoids)
            updateRotating(storedState.rotating)
            if (!tensegrity) {
                return
            }
            mainInstance.world.set_coloring(storedState.showPushes, storedState.showPulls)
            mainInstance.world.set_surface_character(storedState.surfaceCharacter)
        })
        return () => subscription.unsubscribe()
    }, [tensegrity])

    useEffect(() => {
        const featureSubscriptions = Object.keys(floatFeatures).map(k => floatFeatures[k]).map((feature: FloatFeature) =>
            feature.observable.subscribe((value: IFeatureValue) => {
                if (!tensegrity) {
                    return
                }
                tensegrity.instance.applyFeature(feature)
                const intervalRole = fabricFeatureIntervalRole(feature.config.feature)
                if (intervalRole !== undefined) {
                    tensegrity.intervals
                        .filter(interval => interval.intervalRole === intervalRole)
                        .forEach(interval => {
                            const scaledLength = feature.numeric * percentToFactor(interval.scale)
                            tensegrity.instance.fabric.change_rest_length(interval.index, scaledLength, 500)
                        })
                }
            }))
        return () => featureSubscriptions.forEach(sub => sub.unsubscribe())
    }, [tensegrity])

    function runTenscript(newTenscript: ITenscript): void {
        if (!mainInstance) {
            return
        }
        location.hash = newTenscript.code
        floatFeatures[FabricFeature.ShapingPretenstFactor].percent = 100
        floatFeatures[FabricFeature.ShapingDrag].percent = 100
        floatFeatures[FabricFeature.ShapingStiffnessFactor].percent = 100
        storedState$.next(transition(storedState$.getValue(), {ellipsoids: false}))
        // Object.keys(floatFeatures).map(k => floatFeatures[k]).forEach((feature: FloatFeature) => mainInstance.applyFeature(feature))
        const roleLength = (role: IntervalRole) => roleDefaultFromFeatures(floatFeatures, role)
        const numericFeature = (feature: FabricFeature) => storedState$.getValue().featureValues[feature].numeric
        const newTensegrity = new Tensegrity(roleLength, numericFeature, mainInstance, newTenscript)
        newTensegrity.capture = new FrameCapture(storedState$.getValue(), 2000)
        setTensegrity(newTensegrity)
    }

    useEffect(() => {
        const timer = setTimeout(() => {
            if (!tensegrity) {
                runTenscript(rootTenscript)
            }
        }, 200)
        return () => clearTimeout(timer)
    }, [rootTenscript])

    function toFullScreen(value: boolean): void {
        storedState$.next(transition(storedState$.getValue(), {fullScreen: value}))
    }

    return (
        <>
            {fullScreen ? (
                <Button id="to-full-screen" color="dark" onClick={() => toFullScreen(false)}>
                    <FaArrowRight/><br/><FaToolbox/><br/><FaArrowRight/>
                </Button>
            ) : (
                <div
                    id="left-side"
                    style={{
                        visibility: fullScreen ? "collapse" : "visible",
                        width: SPLIT_LEFT,
                    }}
                >
                    <ControlTabs
                        floatFeatures={floatFeatures}
                        rootTenscript={rootTenscript}
                        setRootTenscript={setRootTenscript}
                        tensegrity={tensegrity}
                        setFabric={setTensegrity}
                        selectedIntervals={selectedIntervals}
                        shapeSelection={shapeSelection}
                        setShapeSelection={setShapeSelection}
                        selectedFaces={selectedFaces}
                        clearSelectedFaces={() => setSelectedFaces([])}
                        runTenscript={runTenscript}
                        toFullScreen={() => toFullScreen(true)}
                        visibleRoles={visibleRoles}
                        setVisibleRoles={setVisibleRoles}
                        storedState$={storedState$}
                    />
                </div>
            )}
            <div style={{
                position: "absolute",
                left: fullScreen ? 0 : SPLIT_RIGHT,
                right: 0,
                height: "100%",
            }}>
                {!tensegrity ? (
                    <div id="tensegrity-view" className="h-100">
                        <div style={{position: "relative", top: "50%", left: "50%"}}>
                            <Button onClick={() => runTenscript(rootTenscript)}>
                                <h6>{rootTenscript.name}</h6>
                                <h1><FaPlay/></h1>
                            </Button>
                        </div>
                    </div>
                ) : (
                    <div className="h-100">
                        <TopMiddle tensegrity={tensegrity}/>
                        <div id="bottom-middle">
                            <ButtonGroup>
                                <Button
                                    color={ellipsoids ? "warning" : "secondary"}
                                    onClick={() => storedState$.next(transition(storedState$.getValue(), {ellipsoids: !ellipsoids}))}
                                >
                                    <FaCamera/>
                                </Button>
                                <Button
                                    color={shapeSelection === ShapeSelection.Faces ? "warning" : "secondary"}
                                    disabled={ellipsoids && shapeSelection === ShapeSelection.None}
                                    onClick={() => setShapeSelection(shapeSelection !== ShapeSelection.Faces ? ShapeSelection.Faces : ShapeSelection.None)}
                                >
                                    <span><FaHandPointUp/></span>
                                </Button>
                                <Button
                                    color={rotating ? "warning" : "secondary"}
                                    onClick={() => storedState$.next(transition(storedState$.getValue(), {rotating: !rotating}))}
                                >
                                    <FaSyncAlt/>
                                </Button>
                            </ButtonGroup>
                        </div>
                        <div id="view-container" className="h-100">
                            <Canvas style={{
                                backgroundColor: "black",
                                borderStyle: "solid",
                                borderColor: shapeSelection === ShapeSelection.Faces || ellipsoids ? "#f0ad4e" : "black",
                                cursor: shapeSelection === ShapeSelection.Faces ? "pointer" : "all-scroll",
                                borderWidth: "2px",
                            }}>
                                <FabricView
                                    tensegrity={tensegrity}
                                    fabricError={error => console.error(error)}
                                    selectedIntervals={selectedIntervals}
                                    selectedFaces={selectedFaces}
                                    setSelectedFaces={setSelectedFaces}
                                    shapeSelection={shapeSelection}
                                    ellipsoids={ellipsoids}
                                    visibleRoles={visibleRoles}
                                    storedState$={storedState$}
                                />
                            </Canvas>
                        </div>
                    </div>
                )}
            </div>
        </>
    )
}

function TopMiddle({tensegrity}: { tensegrity: Tensegrity }): JSX.Element {
    const [life, updateLife] = useState(tensegrity.life)
    useEffect(() => {
        const sub = tensegrity.life$.subscribe(updateLife)
        return () => sub.unsubscribe()
    }, [tensegrity])
    return (
        <div id="top-middle">
            <span>{Stage[life.stage]}</span> <i>"{tensegrity.tenscript.name}"</i>
        </div>
    )
}

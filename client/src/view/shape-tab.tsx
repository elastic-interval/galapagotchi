/*
 * Copyright (c) 2019. Beautiful Code BV, Rotterdam, Netherlands
 * Licensed under GNU GENERAL PUBLIC LICENSE Version 3.
 */

import { Stage, WorldFeature } from "eig"
import * as React from "react"
import { useEffect, useState } from "react"
import {
    FaArrowAltCircleRight,
    FaArrowDown,
    FaArrowUp,
    FaCheck,
    FaCompass,
    FaDragon,
    FaHandPointUp,
    FaLink,
    FaList,
    FaMagic,
    FaSlidersH,
    FaTimesCircle,
    FaTools,
} from "react-icons/all"
import { Button, ButtonGroup } from "reactstrap"
import { BehaviorSubject } from "rxjs"

import { ADJUSTABLE_INTERVAL_ROLES, intervalRoleName } from "../fabric/eig-util"
import { FloatFeature } from "../fabric/float-feature"
import { MarkAction } from "../fabric/tenscript"
import { Tensegrity } from "../fabric/tensegrity"
import { TensegrityBuilder } from "../fabric/tensegrity-builder"
import { TensegrityOptimizer } from "../fabric/tensegrity-optimizer"
import { IFace, IInterval } from "../fabric/tensegrity-types"
import { IStoredState, roleLengthFeature } from "../storage/stored-state"

import { Grouping } from "./control-tabs"
import { FeaturePanel } from "./feature-panel"
import { LifeStageButton, StageTransition } from "./life-stage-button"

export enum ShapeSelection {
    None,
    Faces,
    Intervals,
}

// brick
// triangle
// pulls
// choose joint
// choose interval


export function ShapeTab(
    {
        floatFeatures, tensegrity, selectedIntervals,
        setFabric, shapeSelection, setShapeSelection,
        selectedFaces, clearSelection, storedState$,
    }: {
        floatFeatures: Record<WorldFeature, FloatFeature>,
        tensegrity: Tensegrity,
        setFabric: (tensegrity: Tensegrity) => void,
        selectedIntervals: IInterval[],
        shapeSelection: ShapeSelection,
        setShapeSelection: (shapeSelection: ShapeSelection) => void,
        selectedFaces: IFace[],
        clearSelection: () => void,
        storedState$: BehaviorSubject<IStoredState>,
    }): JSX.Element {

    const [pushAndPull, setPushAndPull] = useState(false)
    useEffect(() => {
        tensegrity.instance.world.set_push_and_pull(pushAndPull)
    }, [pushAndPull])

    const [ellipsoids, updateEllipsoids] = useState(storedState$.getValue().ellipsoids)
    useEffect(() => {
        const subscriptions = [
            storedState$.subscribe(newState => updateEllipsoids(newState.ellipsoids)),
        ]
        return () => subscriptions.forEach(sub => sub.unsubscribe())
    }, [])

    const [life, updateLife] = useState(tensegrity.life$.getValue())
    useEffect(() => {
        const sub = tensegrity.life$.subscribe(updateLife)
        return () => sub.unsubscribe()
    }, [tensegrity])

    const [lengthFeature, setLengthFeature] = useState(floatFeatures[WorldFeature.NexusPushLength])

    const adjustValue = (up: boolean, pushes: boolean, pulls: boolean) => () => {
        function adjustment(): number {
            const factor = 1.03
            return up ? factor : (1 / factor)
        }

        if (!selectedIntervals) {
            return
        }
        selectedIntervals.forEach(interval => {
            if (interval.isPush && !pushes || !interval.isPush && !pulls) {
                return
            }
            tensegrity.changeIntervalScale(interval, adjustment())
        })
    }

    function connect(): void {
        const pulls = new TensegrityBuilder(tensegrity).createFaceIntervals(selectedFaces, {action: MarkAction.JoinFaces})
        tensegrity.faceIntervals.push(...pulls)
        clearSelection()
        setShapeSelection(ShapeSelection.None)
        setFabric(tensegrity)
    }

    function disabled(): boolean {
        return ellipsoids || life.stage !== Stage.Shaping
    }

    function disableUnlessFaceCount(faceCount: number, mode: ShapeSelection): boolean {
        if (disabled() || shapeSelection !== mode) {
            return true
        }
        return selectedFaces.length < faceCount || ellipsoids
    }

    function disabledLifeStage(): boolean {
        return ellipsoids || shapeSelection !== ShapeSelection.None
    }

    return (
        <div>
            <Grouping>
                <h6 className="w-100 text-center"><FaArrowAltCircleRight/> Phase</h6>
                <LifeStageButton
                    tensegrity={tensegrity}
                    stageTransition={StageTransition.CaptureLengthsToSlack}
                    disabled={disabledLifeStage()}
                />
                <LifeStageButton
                    tensegrity={tensegrity}
                    stageTransition={StageTransition.CurrentLengthsToSlack}
                    disabled={disabledLifeStage()}
                />
            </Grouping>
            <Grouping>
                <h6 className="w-100 text-center"><FaHandPointUp/> Manual</h6>
                <ButtonGroup size="sm" className="w-100 my-2">
                    <Button
                        color={shapeSelection === ShapeSelection.Faces ? "warning" : "secondary"}
                        disabled={ellipsoids && shapeSelection === ShapeSelection.None}
                        onClick={() => {
                            clearSelection()
                            setShapeSelection(shapeSelection !== ShapeSelection.Faces ? ShapeSelection.Faces : ShapeSelection.None)
                        }}
                    >
                        <span><FaHandPointUp/> Select faces</span>
                    </Button>
                    <Button
                        color={shapeSelection === ShapeSelection.Intervals ? "warning" : "secondary"}
                        disabled={ellipsoids && shapeSelection === ShapeSelection.None || selectedFaces.length === 0}
                        onClick={() => {
                            if (shapeSelection === ShapeSelection.Intervals) {
                                clearSelection()
                            }
                            setShapeSelection(shapeSelection === ShapeSelection.Intervals ? ShapeSelection.None : ShapeSelection.Intervals)
                        }}
                    >
                        <span><FaSlidersH/> Make length adjustments</span>
                    </Button>
                </ButtonGroup>
                <ButtonGroup size="sm" className="w-100 my-2">
                    <Button disabled={disableUnlessFaceCount(1, ShapeSelection.Intervals)}
                            onClick={adjustValue(true, true, true)}>
                        TC <FaArrowUp/>
                    </Button>
                    <Button disabled={disableUnlessFaceCount(1, ShapeSelection.Intervals)}
                            onClick={adjustValue(false, true, true)}>
                        TC <FaArrowDown/>
                    </Button>
                    <Button disabled={disableUnlessFaceCount(1, ShapeSelection.Intervals)}
                            onClick={adjustValue(true, false, true)}>
                        T<FaArrowUp/>
                    </Button>
                    <Button disabled={disableUnlessFaceCount(1, ShapeSelection.Intervals)}
                            onClick={adjustValue(false, false, true)}>
                        T <FaArrowDown/>
                    </Button>
                    <Button disabled={disableUnlessFaceCount(1, ShapeSelection.Intervals)}
                            onClick={adjustValue(true, true, false)}>
                        C <FaArrowUp/>
                    </Button>
                    <Button disabled={disableUnlessFaceCount(1, ShapeSelection.Intervals)}
                            onClick={adjustValue(false, true, false)}>
                        C <FaArrowDown/>
                    </Button>
                </ButtonGroup>
                <ButtonGroup size="sm" className="w-100 my-2">
                    <Button
                        disabled={selectedFaces.length === 0 || disabled() && shapeSelection !== ShapeSelection.None}
                        onClick={() => clearSelection()}
                    >
                        <FaTimesCircle/> Clear selection
                    </Button>
                    <Button
                        disabled={disableUnlessFaceCount(1, ShapeSelection.Faces)}
                        onClick={() => {
                            new TensegrityBuilder(tensegrity).faceToOrigin(selectedFaces[0])
                            tensegrity.instance.refreshFloatView()
                            clearSelection()
                        }}>
                        <FaCompass/><span> Upright</span>
                    </Button>
                    <Button
                        disabled={disableUnlessFaceCount(2, ShapeSelection.Faces)}
                        onClick={connect}>
                        <FaLink/><span> Connect</span>
                    </Button>
                    <Button
                        disabled={disabled()}
                        onClick={() => new TensegrityOptimizer(tensegrity)
                            .replaceCrosses(tensegrity.numericFeature(WorldFeature.IntervalCountdown))
                        }>
                        <FaMagic/><span> Optimize</span>
                    </Button>
                </ButtonGroup>
            </Grouping>
            <Grouping>
                <h6 className="w-100 text-center"><FaTools/> Adjustments</h6>
                <FeaturePanel feature={floatFeatures[WorldFeature.ShapingPretenstFactor]} disabled={disabled()}/>
                <FeaturePanel feature={floatFeatures[WorldFeature.ShapingDrag]} disabled={disabled()}/>
                <FeaturePanel feature={floatFeatures[WorldFeature.ShapingStiffnessFactor]} disabled={disabled()}/>
                <ButtonGroup size="sm" className="w-100 my-2">
                    <Button
                        disabled={disabled()}
                        color={pushAndPull ? "secondary" : "success"}
                        onClick={() => setPushAndPull(false)}
                    ><FaCheck/>: T or C</Button>
                    <Button
                        disabled={disabled()}
                        color={pushAndPull ? "success" : "secondary"}
                        onClick={() => setPushAndPull(true)}
                    ><FaDragon/>: T=C</Button>
                </ButtonGroup>
            </Grouping>
            <Grouping>
                <h6 className="w-100 text-center"><FaList/> Default Lengths</h6>
                <FeaturePanel key={lengthFeature.title} feature={lengthFeature} disabled={disabled()}/>
                <ButtonGroup className="my-2 w-100">{
                    ADJUSTABLE_INTERVAL_ROLES
                        .map(intervalRole => ({
                            intervalRole,
                            feature: floatFeatures[roleLengthFeature(intervalRole)],
                        }))
                        .map(({intervalRole, feature}) => (
                            <Button size="sm" key={`IntervalRole[${intervalRole}]`}
                                    onClick={() => setLengthFeature(feature)}
                                    color={lengthFeature.worldFeature === feature.worldFeature ? "success" : "secondary"}
                            >
                                {intervalRoleName(intervalRole)}
                            </Button>
                        ))
                }</ButtonGroup>
            </Grouping>
        </div>
    )
}

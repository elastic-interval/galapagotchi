/*
 * Copyright (c) 2019. Beautiful Code BV, Rotterdam, Netherlands
 * Licensed under GNU GENERAL PUBLIC LICENSE Version 3.
 */

import { Stage } from "eig"
import * as React from "react"
import { useEffect, useState } from "react"
import {
    FaArrowRight,
    FaCamera,
    FaChartBar,
    FaClock,
    FaHandSpock,
    FaSeedling,
    FaSlidersH,
    FaYinYang,
} from "react-icons/all"
import { Button } from "reactstrap"

import { Tensegrity, ToDo } from "../fabric/tensegrity"

export enum StageTransition {
    CaptureLengthsToSlack,
    SlackToPretensing,
    CapturePretenstToSlack,
    CaptureStrainForStiffness,
}

export const STAGE_TRANSITIONS = Object.keys(StageTransition)
    .filter(k => isNaN(parseInt(k, 10)))
    .map(k => StageTransition[k])

export function StageButton({tensegrity, stageTransition, disabled}: {
    tensegrity: Tensegrity,
    stageTransition: StageTransition,
    disabled: boolean,
}): JSX.Element {

    const [stage, updateStage] = useState(tensegrity.stage)
    useEffect(() => {
        const sub = tensegrity.stage$.subscribe(updateStage)
        return () => sub.unsubscribe()
    }, [tensegrity])

    function allDisabledExcept(stageAccepted: Stage): boolean {
        if (disabled || stage === Stage.Pretensing) {
            return true
        }
        return stage !== stageAccepted
    }

    function doNow(todo: ToDo): void {
        tensegrity.toDo = {todo}
    }

    switch (stageTransition) {
        case StageTransition.CaptureLengthsToSlack:
            return (
                <Button
                    disabled={allDisabledExcept(Stage.Shaping)}
                    onClick={() => doNow(t => t.stage = Stage.Slack)}
                >
                    <FaCamera/><FaArrowRight/><Symbol stage={Stage.Slack}/>
                </Button>
            )
        case StageTransition.SlackToPretensing:
            return (
                <Button
                    disabled={allDisabledExcept(Stage.Slack)}
                    onClick={() => doNow(t => t.stage = Stage.Pretensing)}
                >
                    <Symbol stage={Stage.Slack}/><FaArrowRight/><Symbol stage={Stage.Pretenst}/>
                </Button>
            )
        case StageTransition.CapturePretenstToSlack:
            return (
                <Button
                    disabled={allDisabledExcept(Stage.Pretenst)}
                    onClick={() => doNow(t => t.stage = Stage.Slack)}
                >
                    <Symbol stage={Stage.Pretenst}/><FaArrowRight/><Symbol stage={Stage.Slack}/>
                </Button>
            )
        case StageTransition.CaptureStrainForStiffness:
            return (
                <Button
                    disabled={allDisabledExcept(Stage.Pretenst)}
                    onClick={() => doNow(t => {
                        t.stage = Stage.Slack
                        t.strainToStiffness()
                    })}
                >
                    <Symbol stage={Stage.Pretenst}/><FaArrowRight/><Symbol stage={Stage.Slack}/><FaChartBar/>
                </Button>
            )
    }
}

function Symbol({stage}: { stage: Stage }): JSX.Element {
    switch (stage) {
        case Stage.Growing:
            return <FaSeedling/>
        case Stage.Shaping:
            return <FaSlidersH/>
        case Stage.Slack:
            return <FaYinYang/>
        case Stage.Pretensing:
            return <FaClock/>
        case Stage.Pretenst:
            return <FaHandSpock/>
        default:
            throw new Error("Stage?")
    }
}

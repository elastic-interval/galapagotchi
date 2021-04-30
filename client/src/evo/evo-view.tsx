/*
 * Copyright (c) 2019. Beautiful Code BV, Rotterdam, Netherlands
 * Licensed under GNU GENERAL PUBLIC LICENSE Version 3.
 */

import { Stage, SurfaceCharacter } from "eig"
import * as React from "react"
import { useEffect, useRef, useState } from "react"
import { FaBaby, FaDna, FaEye, FaEyeSlash, FaRunning, FaSignOutAlt, FaYinYang } from "react-icons/all"
import { Canvas, useFrame, useThree } from "react-three-fiber"
import { Button, ButtonGroup } from "reactstrap"
import { useRecoilState, useRecoilValue } from "recoil"
import { PerspectiveCamera, Vector3 } from "three"

import { GlobalMode, reloadGlobalMode, stageName } from "../fabric/eig-util"
import { CreateInstance } from "../fabric/fabric-instance"
import { compileTenscript } from "../fabric/tenscript"
import { Tensegrity } from "../fabric/tensegrity"
import { percentOrHundred } from "../fabric/tensegrity-types"

import { homePatchSelector, islandAtom, RUNNER_CODE } from "./evo-state"
import { emptyGenome, fromGeneData } from "./genome"
import { IslandView } from "./island-view"
import { Patch } from "./patch"
import { EVO_PARAMETERS, EvolutionPhase, IEvolutionSnapshot, Population } from "./population"
import { Runner } from "./runner"
import { Direction, IRunnerState } from "./runner-logic"
import { EvolutionInfo, StatsView } from "./stats-view"

export enum Happening {
    Developing,
    Resting,
    Running,
    Evolving,
}

export function EvoView({createBodyInstance}: {
    createBodyInstance: CreateInstance,
}): JSX.Element {
    const [island] = useRecoilState(islandAtom)
    const homePatch = useRecoilValue(homePatchSelector)
    // const [cyclePattern, setCyclePattern] = useState<number[]>(EVO_PARAMETERS.cycle)
    const [runner, setRunner] = useState(() => newRunner(homePatch))
    const [happening, setHappening] = useState(Happening.Developing)
    const [evoDetails, setEvoDetails] = useState(true)
    const [snapshots, setSnapshots] = useState<IEvolutionSnapshot[]>([])
    const [evolutionCountdown, setEvolutionCountdown] = useState(-1)
    const [population, setPopulation] = useState<Population | undefined>(undefined)
    const [phase, setPhase] = useState(EvolutionPhase.WinnersRun)
    const [stage, updateStage] = useState<Stage | undefined>(undefined)

    function newRunner(patch: Patch): Runner {
        const targetPatch = patch.adjacent[0]
        if (!targetPatch) {
            throw new Error("No adjacent")
        }
        const storedGenome = patch.storedGenes[0]
        const genome = storedGenome ? fromGeneData(storedGenome) : emptyGenome()
        const instance = createBodyInstance(SurfaceCharacter.Sticky)
        const state: IRunnerState = {
            patch,
            targetPatch,
            instance,
            midpoint: new Vector3().copy(patch.center),
            genome,
            loopMuscles: [],
            direction: Direction.ToA,
            directionHistory: [],
            autopilot: false,
            timeSlice: 10,
            twitchesPerCycle: 10,
        }
        const tree = compileTenscript(RUNNER_CODE, (err) => {
            throw new Error("unable to compile runner: " + err)
        })
        if (!tree) {
            throw new Error("no tree")
        }
        const embryo = new Tensegrity(patch.center, percentOrHundred(), instance, 1000, RUNNER_CODE, tree)
        return new Runner(state, embryo)
    }

    // function newFlora(patch: Patch, instance: FabricInstance): Flora {
    //     const tree = compileTenscript(FLORA_CODE, (err) => {
    //         throw new Error("unable to compile sat tree: " + err)
    //     })
    //     if (!tree) {
    //         throw new Error("no tree")
    //     }
    //     const tensegrity = new Tensegrity(patch.center, percentOrHundred(), instance, 1000, FLORA_CODE, tree)
    //     return new Flora(patch.name, tensegrity)
    // }

    useEffect(() => {
        if (!runner || !runner.embryo) {
            updateStage(undefined)
            return
        }
        const sub = runner.embryo.stage$.subscribe((newStage: Stage) => {
            if (newStage === Stage.Pretenst) {
                setHappening(Happening.Resting)
            }
            updateStage(newStage)
        })
        return () => sub.unsubscribe()
    }, [runner])

    useEffect(() => {
        if (!population) {
            return
        }
        const sub = population.snapshotsSubject.subscribe(setSnapshots)
        return () => sub.unsubscribe()
    }, [population])

    const evolveWithPattern = (toEvolve: Runner, pattern: number[]) => {
        if (population) {
            setPopulation(population.withReducedCyclePattern)
            // todo: free up current evolution?
        } else {
            setPopulation(new Population(toEvolve, createBodyInstance, false, pattern))
        }
        setHappening(Happening.Evolving)
    }

    const countdownToEvolution = (countdown: number) => {
        setEvolutionCountdown(countdown)
        if (runner && countdown === 0) {
            evolveWithPattern(runner, EVO_PARAMETERS.cyclePattern)
        }
    }

    const stopEvolution = (nextEvolution: Population) => {
        // todo: free up current evolution?
        setPopulation(nextEvolution)
        if (!nextEvolution) {
            setRunner(newRunner(homePatch))
            setHappening(Happening.Developing)
        }
    }

    return (
        <div style={{
            position: "absolute",
            left: 0,
            right: 0,
            height: "100%",
        }}>
            <Canvas key={island.name} style={{backgroundColor: "black"}}>
                <Camera/>
                <IslandView
                    island={island}
                    happening={happening}
                    runner={runner}
                    population={population}
                    evolutionPhase={evolutionPhase => {
                        if (evolutionPhase !== phase) {
                            setPhase(evolutionPhase)
                        }
                    }}
                    countdownToEvo={countdownToEvolution}
                    stopEvo={stopEvolution}
                />
            </Canvas>
            {!runner ? <h1>no runner</h1> : (happening === Happening.Developing) ? (
                !stage ? <h1>nothing</h1> : (
                    <div id="bottom-middle">
                        <div className="py-2 px-3 text-center">
                            <FaBaby/> {stageName(stage)}
                        </div>
                    </div>
                )
            ) : (
                <ControlButtons
                    runner={runner}
                    happening={happening}
                    evoCountdown={evolutionCountdown}
                    evoDetails={evoDetails}
                    toRunning={() => {
                        setHappening(Happening.Running)
                        runner.autopilot = true
                    }}
                    toEvolving={() => {
                        setHappening(Happening.Evolving)
                        setEvolutionCountdown(-1)
                        evolveWithPattern(runner, EVO_PARAMETERS.cyclePattern)
                    }}
                    toRebirth={() => {
                        setRunner(newRunner(homePatch))
                        setHappening(Happening.Developing)
                    }}
                    toRest={() => {
                        setHappening(Happening.Resting)
                        runner.direction = Direction.Rest
                    }}
                    toggleDetails={() => setEvoDetails(!evoDetails)}
                />
            )}
            {!population ? undefined : (
                <>
                    <div id="top-middle">
                        {snapshots.length <= 0 || evoDetails ? (
                            <strong className="p-2">{phase}</strong>
                        ) : (
                            <EvolutionInfo snapshot={snapshots[snapshots.length - 1]}/>
                        )}
                    </div>
                    <EvolutionStatsView
                        happening={happening}
                        evolution={population}
                        snapshots={snapshots}
                        evoDetails={evoDetails}
                    />
                </>
            )}
            <div id="bottom-right">
                <ButtonGroup vertical={false} className="w-100">
                    <Button onClick={() => reloadGlobalMode(GlobalMode.Design)}><FaSignOutAlt/></Button>
                </ButtonGroup>
            </div>
        </div>
    )
}

function ControlButtons({
                            runner,
                            happening,
                            evoDetails,
                            evoCountdown,
                            toRunning,
                            toRest,
                            toEvolving,
                            toRebirth,
                            toggleDetails,
                        }: {
    runner?: Runner,
    happening: Happening,
    evoCountdown: number,
    evoDetails: boolean,
    toRunning: () => void,
    toEvolving: () => void,
    toRebirth: () => void,
    toRest: () => void,
    toggleDetails: () => void,
}): JSX.Element {
    const createContent = () => {
        switch (happening) {
            case Happening.Developing:
                return <h1>developing</h1>
            case Happening.Resting:
                return !runner ? undefined : (
                    <ButtonGroup className="w-100">
                        <Button color="success" onClick={toRunning}>
                            <FaRunning/>
                        </Button>
                        <Button color="success" onClick={toEvolving}>
                            <FaDna/> {evoCountdown >= 0 ? evoCountdown : ""}
                        </Button>
                        <Button color="success" onClick={toRebirth}>
                            <FaBaby/>
                        </Button>
                    </ButtonGroup>
                )
            case Happening.Running:
                return !runner ? undefined : (
                    <ButtonGroup className="w-100">
                        <Button color="success" onClick={toRest}>
                            <FaYinYang/> Rest
                        </Button>
                    </ButtonGroup>
                )
            case Happening.Evolving:
                return !runner ? undefined : (
                    <ButtonGroup className="w-100">
                        <Button color="success" onClick={toRebirth}>
                            <FaBaby/>
                        </Button>
                        <Button color={evoDetails ? "success" : "secondary"} onClick={toggleDetails}>
                            <FaDna/>&nbsp;{evoDetails ? <FaEye/> : <FaEyeSlash/>}
                        </Button>
                    </ButtonGroup>
                )
        }
    }
    const content = createContent()
    if (!content) {
        return <h1>{happening}</h1>
    }
    return (
        <div id="bottom-middle">{content}</div>
    )
}

function EvolutionStatsView({happening, evolution, snapshots, evoDetails}: {
    happening: Happening,
    evolution: Population,
    snapshots: IEvolutionSnapshot[],
    evoDetails: boolean,
}): JSX.Element {
    switch (happening) {
        case Happening.Developing:
        case Happening.Running:
        case Happening.Resting:
            return <div/>
        case Happening.Evolving:
            return !(evolution && snapshots.length > 0 && evoDetails) ? <div/> : (
                <div id="evolution-stats">
                    <StatsView snapshots={snapshots}/>
                </div>
            )
    }
}

function Camera(props: object): JSX.Element {
    const ref = useRef<PerspectiveCamera>()
    const {setDefaultCamera} = useThree()
    // Make the camera known to the system
    useEffect(() => {
        const camera = ref.current
        if (!camera) {
            throw new Error("No camera")
        }
        camera.fov = 50
        camera.position.set(-4, 5, 10)
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


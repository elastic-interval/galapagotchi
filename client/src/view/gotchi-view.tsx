/*
 * Copyright (c) 2019. Beautiful Code BV, Rotterdam, Netherlands
 * Licensed under GNU GENERAL PUBLIC LICENSE Version 3.
 */

import * as React from "react"
import * as R3 from "react-three"
import { Subject } from "rxjs"
import { BehaviorSubject } from "rxjs/BehaviorSubject"
import { Subscription } from "rxjs/Subscription"
import { Mesh, PerspectiveCamera, Vector3 } from "three"
import { OrbitControls } from "three-orbitcontrols-ts"

import { NORMAL_TICKS } from "../body/fabric"
import { Direction } from "../body/fabric-exports"
import { Spot } from "../island/spot"
import { ClickHandler } from "../state/click-handler"
import { IslandState } from "../state/island-state"

import { EvolutionComponent } from "./evolution-component"
import { Flight, FlightMode } from "./flight"
import { IslandComponent } from "./island-component"
import { JourneyComponent } from "./journey-component"
import { GOTCHI, GOTCHI_ARROW } from "./materials"
import { MeshKey, SpotSelector } from "./spot-selector"

interface IGotchiViewProps {
    perspectiveCamera: PerspectiveCamera
    width: number
    height: number
    left: number
    top: number
    userId?: string
    islandState: IslandState
    stateSubject: Subject<IslandState>
    flightMode: BehaviorSubject<FlightMode>
}

interface IGotchiViewState {
    flightMode: FlightMode
}

export class GotchiView extends React.Component<IGotchiViewProps, IGotchiViewState> {
    private subs: Subscription[] = []
    private flight: Flight
    private spotSelector: SpotSelector
    private animating = true
    private target?: Vector3

    constructor(props: IGotchiViewProps) {
        super(props)
        const flightMode = this.props.flightMode.getValue()
        this.state = {flightMode}
        this.spotSelector = new SpotSelector(
            this.props.perspectiveCamera,
            this.props.islandState.island,
            this.props.width,
            this.props.height,
        )
    }

    public componentDidUpdate(prevProps: Readonly<IGotchiViewProps>, prevState: Readonly<IGotchiViewState>, snapshot: object): void {
        if (prevProps.width !== this.props.width || prevProps.height !== this.props.height) {
            this.props.perspectiveCamera.aspect = this.props.width / this.props.height
            this.props.perspectiveCamera.updateProjectionMatrix()
            this.spotSelector.setSize(this.props.width, this.props.height)
        }
    }

    public componentDidMount(): void {
        const element: HTMLElement | undefined = document.getElementById("gotchi-view") || undefined
        if (element) {
            const islandState = this.props.islandState
            this.target = islandState.homeHexalot ? islandState.homeHexalot.seed : islandState.island.midpoint
            const orbitControls = new OrbitControls(this.props.perspectiveCamera, element)
            this.flight = new Flight(orbitControls, this.props.flightMode, this.target)
            this.flight.setupCamera()
            this.animate()
            this.subs.push(this.props.flightMode.subscribe(orbitDistance => this.setState({flightMode: orbitDistance})))
        }
    }

    public componentWillReceiveProps(nextProps: Readonly<IGotchiViewProps>, nextContext: object): void {
        const selectedHexalot = nextProps.islandState.selectedHexalot
        if (selectedHexalot) {
            this.target = selectedHexalot.seed
            return
        }
        const selectedSpot = nextProps.islandState.selectedSpot
        if (selectedSpot) {
            this.target = selectedSpot.center
            return
        }
        this.target = nextProps.islandState.island.midpoint
    }

    public componentWillUnmount(): void {
        this.animating = false
        this.subs.forEach(s => s.unsubscribe())
    }

    public render(): JSX.Element {
        const islandState = this.props.islandState
        const evolution = islandState.evolution
        const jockey = islandState.jockey
        const freeGotchi = islandState.gotchi
        const gotchi = freeGotchi ? freeGotchi : jockey ? jockey.gotchi : undefined
        const journey = islandState.journey
        return (
            <div id="gotchi-view" onMouseDownCapture={(event: React.MouseEvent<HTMLDivElement>) => {
                const spot = this.spotSelector.getSpot(MeshKey.SPOTS_KEY, event)
                if (spot) {
                    this.click(spot)
                }
            }}>
                <R3.Renderer width={this.props.width} height={this.props.height}>
                    <R3.Scene width={this.props.width} height={this.props.height} camera={this.props.perspectiveCamera}>
                        <IslandComponent
                            userId={this.props.userId}
                            islandState={this.props.islandState}
                            setMesh={(key: MeshKey, node: Mesh) => this.spotSelector.setMesh(key, node)}
                        />
                        {!evolution ? undefined : (
                            <EvolutionComponent evolution={evolution}/>)
                        }
                        {!gotchi ? undefined : (
                            <R3.Object3D key="Gotchi">
                                <R3.LineSegments
                                    key="Vectors"
                                    geometry={gotchi.fabric.pointerGeometryFor(gotchi.fabric.currentDirection)}
                                    material={GOTCHI_ARROW}
                                />
                                <R3.Mesh
                                    geometry={gotchi.fabric.facesGeometry}
                                    material={GOTCHI}
                                />
                            </R3.Object3D>
                        )}
                        {!journey ? undefined : (
                            <JourneyComponent journey={journey}/>
                        )}
                    </R3.Scene>
                </R3.Renderer>
            </div>
        )
    }

// =================================================================================================================

    private async click(spot: Spot): Promise<void> {
        const props = this.props
        const clickHandler = new ClickHandler(props.islandState, props.userId)
        const afterClick = await clickHandler.stateAfterClick(spot)
        props.stateSubject.next(afterClick)
    }

    private animate(): void {
        const step = () => {
            setTimeout(
                () => {
                    const evolution = this.props.islandState.evolution
                    if (evolution) {
                        evolution.iterate()
                        this.target = evolution.midpoint
                    }
                    const jockey = this.props.islandState.jockey
                    if (jockey) {
                        if (jockey.touchedDestination) {
                            const nextLeg = jockey.leg.nextLeg
                            if (nextLeg) {
                                jockey.leg = nextLeg
                            } else {
                                jockey.gotchi.nextDirection = Direction.REST
                            }
                        } else if (jockey.gotchi.currentDirection !== Direction.REST) {
                            jockey.adjustDirection()
                        }
                    }
                    const freeGotchi = this.props.islandState.gotchi
                    const gotchi = freeGotchi ? freeGotchi : jockey ? jockey.gotchi : undefined
                    if (gotchi) {
                        gotchi.iterate(NORMAL_TICKS)
                        this.target = gotchi.midpoint
                    }
                    if (this.target) {
                        this.flight.moveTargetTowards(this.target)
                    }
                    if (this.animating) {
                        this.flight.update()
                        this.forceUpdate()
                        requestAnimationFrame(step)
                    }
                },
                10,
            )
        }
        requestAnimationFrame(step)
    }
}


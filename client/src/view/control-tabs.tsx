/*
 * Copyright (c) 2019. Beautiful Code BV, Rotterdam, Netherlands
 * Licensed under GNU GENERAL PUBLIC LICENSE Version 3.
 */

import * as React from "react"
import { useEffect, useState } from "react"
import {
    FaAngleDoubleLeft,
    FaArrowDown,
    FaArrowUp,
    FaBiohazard,
    FaCamera,
    FaCircle,
    FaCompressArrowsAlt,
    FaCubes,
    FaDotCircle,
    FaFileCsv,
    FaHandPointUp,
    FaHandRock,
    FaParachuteBox,
    FaRadiationAlt,
    FaTimesCircle,
} from "react-icons/all"
import {
    Button,
    ButtonDropdown,
    ButtonGroup,
    DropdownItem,
    DropdownMenu,
    DropdownToggle,
    Nav,
    NavItem,
    NavLink,
    TabContent,
    TabPane,
} from "reactstrap"
import { BehaviorSubject } from "rxjs"

import { SurfaceCharacter } from "../fabric/fabric-engine"
import { FloatFeature } from "../fabric/fabric-features"
import { LifePhase } from "../fabric/life-phase"
import { optimizeFabric } from "../fabric/tensegrity-brick"
import { IBrick } from "../fabric/tensegrity-brick-types"
import { TensegrityFabric } from "../fabric/tensegrity-fabric"
import { saveCSVFiles, saveOBJFile } from "../storage/download"

import { CodePanel, ICode } from "./code-panel"
import { FeaturePanel } from "./feature-panel"
import { LifePhasePanel } from "./life-phase-panel"
import { StrainPanel } from "./strain-panel"

const SPLIT_LEFT = "34em"

export enum Tab {
    Generate = "Generate",
    Pretense = "Pretense",
    Test = "Test",
}

export function ControlTabs({
                                fabric, lifePhase$, pretensingStep$, bootstrapCode, features,
                                showPushes, setShowPushes, showPulls, setShowPulls, fastMode, setFastMode,
                                selectedBrick, setSelectedBrick, code, setCode, rebuild,
                                setFullScreen,
                            }: {
    fabric?: TensegrityFabric,
    lifePhase$: BehaviorSubject<LifePhase>,
    pretensingStep$: BehaviorSubject<number>
    bootstrapCode: ICode [],
    features: FloatFeature[],
    showPushes: boolean,
    setShowPushes: (value: boolean) => void,
    showPulls: boolean,
    setShowPulls: (value: boolean) => void,
    fastMode: boolean,
    setFastMode: (value: boolean) => void,
    selectedBrick?: IBrick,
    setSelectedBrick: (brick?: IBrick) => void,
    code?: ICode,
    setCode: (brick?: ICode) => void,
    rebuild: () => void,
    setFullScreen: (fullScreen: boolean) => void,
}): JSX.Element {

    const [activeTab, setActiveTab] = useState(Tab.Generate)
    const [surfaceCharacter, setSurfaceCharacter] = useState(SurfaceCharacter.Sticky)
    const [lifePhase, setLifePhase] = useState(lifePhase$.getValue())
    useEffect(() => {
        const subscription = lifePhase$.subscribe(setLifePhase)
        return () => subscription.unsubscribe()
    })

    useEffect(() => {
        if (fabric) {
            fabric.instance.engine.setSurfaceCharacter(surfaceCharacter)
        }
    }, [surfaceCharacter])

    function Controls(): JSX.Element {
        if (!fabric) {
            return <div/>
        }
        const SurfaceCharacterChoice = (): JSX.Element => {
            const [open, setOpen] = useState<boolean>(false)
            return (
                <ButtonDropdown isOpen={open} toggle={() => setOpen(!open)}>
                    <DropdownToggle
                        style={{borderTopRightRadius: "1em"}}>Surface: {SurfaceCharacter[surfaceCharacter]}</DropdownToggle>
                    <DropdownMenu right={false}>
                        {Object.keys(SurfaceCharacter).filter(k => k.length > 1).map(key => (
                            <DropdownItem key={`Surface${key}`}
                                          onClick={() => setSurfaceCharacter(SurfaceCharacter[key])}>
                                {key}
                            </DropdownItem>
                        ))}
                    </DropdownMenu>
                </ButtonDropdown>
            )
        }

        function ViewButton({pushes, pulls}: { pushes: boolean, pulls: boolean }): JSX.Element {
            const onClick = () => {
                setShowPushes(pushes)
                setShowPulls(pulls)
                if (selectedBrick) {
                    setSelectedBrick(undefined)
                }
            }
            const color = pushes === showPushes && pulls === showPulls ? "success" : "secondary"
            return <Button style={{color: "white"}} color={color} onClick={onClick}>
                {pushes && pulls ? (<><FaHandPointUp/><span> Faces</span></>) :
                    pushes ? (<><FaCircle/><span> Pushes </span></>) : (<><FaDotCircle/><span> Pulls </span></>)}
            </Button>
        }

        const adjustValue = (up: boolean) => () => {
            function adjustment(): number {
                const factor = 1.03
                return up ? factor : (1 / factor)
            }

            fabric.forEachSelected(interval => {
                fabric.instance.engine.multiplyRestLength(interval.index, adjustment())
            })
        }
        const engine = fabric.instance.engine
        return (
            <div className="p-4" style={{display: "block"}}>
                <LifePhasePanel
                    lifePhase$={lifePhase$}
                    fabric={fabric}
                    pretensingStep$={pretensingStep$}
                    rebuild={rebuild}
                />
                {selectedBrick ? (
                    <ButtonGroup className="m-4 w-75">
                        <Button disabled={!fabric.splitIntervals} onClick={adjustValue(true)}>
                            <FaArrowUp/><span> Bigger</span>
                        </Button>
                        <Button disabled={!fabric.splitIntervals} onClick={adjustValue(false)}>
                            <FaArrowDown/><span> Smaller</span>
                        </Button>
                        <Button onClick={() => {
                            setSelectedBrick(undefined)
                            fabric.clearSelection()
                        }}>
                            <FaTimesCircle/>
                        </Button>
                    </ButtonGroup>
                ) : (
                    <div className="m-4 w-75">
                        <ButtonGroup style={{display: "flex"}} className="my-2">
                            <ViewButton pushes={false} pulls={true}/>
                            <StrainPanel fabric={fabric} pushes={false}
                                         showPushes={showPushes} showPulls={showPulls}/>
                        </ButtonGroup>
                        <ButtonGroup style={{display: "flex"}} className="my-2">
                            <ViewButton pushes={true} pulls={true}/>
                        </ButtonGroup>
                        <ButtonGroup style={{display: "flex"}} className="my-2">
                            <ViewButton pushes={true} pulls={false}/>
                            <StrainPanel fabric={fabric} pushes={true}
                                         showPushes={showPushes} showPulls={showPulls}/>
                        </ButtonGroup>
                    </div>
                )}
                <ButtonGroup vertical={true} className="m-4 w-75">
                    <Button disabled={lifePhase !== LifePhase.Shaping}
                            onClick={() => optimizeFabric(fabric, true)}>
                        <FaBiohazard/> Long optimize
                    </Button>
                    <Button disabled={lifePhase !== LifePhase.Shaping}
                            onClick={() => optimizeFabric(fabric, false)}>
                        <FaRadiationAlt/> Short optimize
                    </Button>
                    <Button disabled={lifePhase !== LifePhase.Pretenst}
                            onClick={() => engine.setAltitude(1)}>
                        <FaHandRock/> Nudge
                    </Button>
                    <Button disabled={lifePhase !== LifePhase.Pretenst}
                            onClick={() => engine.setAltitude(10)}>
                        <FaParachuteBox/> Drop
                    </Button>
                    <Button onClick={() => fabric.instance.engine.centralize()}>
                        <FaCompressArrowsAlt/> Centralize
                    </Button>
                    {/*<Button onClick={() => setAutoRotate(!autoRotate)}>*/}
                    {/*    <FaSyncAlt/>*/}
                    {/*</Button>*/}
                </ButtonGroup>
                <ButtonGroup vertical={true} className="m-4 w-75">
                    <Button onClick={() => saveCSVFiles(fabric)}>
                        <FaFileCsv/> Download CSV
                    </Button>
                    <Button onClick={() => saveOBJFile(fabric)}>
                        <FaCubes/> Download OBJ
                    </Button>
                </ButtonGroup>
                <ButtonGroup vertical={true} className="m-4 w-75">
                    <SurfaceCharacterChoice/>
                    <Button color={fastMode ? "secondary" : "warning"} onClick={() => setFastMode(!fastMode)}>
                        <FaCamera/> Slow mode
                    </Button>
                </ButtonGroup>
            </div>
        )
    }


    function Link({tab}: { tab: Tab }): JSX.Element {
        return (
            <NavItem>
                <NavLink active={activeTab === tab} onClick={() => setActiveTab(tab)}>{tab}</NavLink>
            </NavItem>
        )
    }

    function Pane({tab}: { tab: Tab }): JSX.Element {

        function Content(): JSX.Element {
            switch (tab) {
                case Tab.Generate:
                    return (
                        <CodePanel
                            bootstrapCode={bootstrapCode}
                            setCode={setCode}
                        />
                    )
                case Tab.Pretense:
                    return !fabric ? <div/> : (
                        <FeaturePanel
                            featureSet={features}
                            fabric={fabric}
                        />
                    )
                case Tab.Test:
                    return (
                        <Controls/>
                    )
            }
        }

        return (
            <TabPane tabId={tab}><Content/></TabPane>
        )
    }

    return (
        <div className="h-100">
            <Nav tabs={true} style={{backgroundColor: "#b2b2b2"}}>
                {Object.keys(Tab).map(tab => <Link key={`T${tab}`} tab={Tab[tab]}/>)}
            </Nav>
            <TabContent activeTab={activeTab}>
                {Object.keys(Tab).map(tab => <Pane key={tab} tab={Tab[tab]}/>)}
            </TabContent>
            <div style={{
                position: "absolute",
                top: 0,
                height: "100%",
                left: SPLIT_LEFT,
                zIndex: 10,
                width: "1em",
            }}>
                <Button
                    style={{
                        padding: 0,
                        margin: 0,
                        borderRadius: 0,
                        width: "1em",
                    }}
                    className="w-100 h-100" color="dark"
                    onClick={() => setFullScreen(true)}
                >
                    <FaAngleDoubleLeft/>
                </Button>
            </div>
        </div>
    )
}

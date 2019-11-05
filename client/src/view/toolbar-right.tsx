/*
 * Copyright (c) 2019. Beautiful Code BV, Rotterdam, Netherlands
 * Licensed under GNU GENERAL PUBLIC LICENSE Version 3.
 */

import * as React from "react"
import { useEffect, useState } from "react"
import { FaCompressArrowsAlt, FaHandRock, FaParachuteBox } from "react-icons/all"
import { Button, ButtonGroup } from "reactstrap"
import { BehaviorSubject } from "rxjs"

import { IFabricState, LifePhase } from "../fabric/fabric-state"
import { TensegrityFabric } from "../fabric/tensegrity-fabric"

export function ToolbarRight({fabric, fabricState$}: {
    fabric: TensegrityFabric,
    fabricState$: BehaviorSubject<IFabricState>,
}): JSX.Element {
    const [lifePhase, setLifePhase] = useState(fabric.lifePhase)
    useEffect(() => {
        const subscription = fabricState$.subscribe(newState => {
            setLifePhase(newState.lifePhase)
        })
        return () => subscription.unsubscribe()
    })
    const engine = fabric.instance.engine
    return (
        <div id="bottom-right">
            <ButtonGroup>
                <Button disabled={lifePhase !== LifePhase.Pretenst}
                        onClick={() => engine.setAltitude(1)}>
                    <FaHandRock/>
                </Button>
                <Button disabled={lifePhase !== LifePhase.Pretenst}
                        onClick={() => engine.setAltitude(10)}>
                    <FaParachuteBox/>
                </Button>
                <Button onClick={() => fabric.instance.engine.centralize()}>
                    <FaCompressArrowsAlt/>
                </Button>
            </ButtonGroup>
        </div>
    )
}

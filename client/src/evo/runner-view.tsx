/*
 * Copyright (c) 2021. Beautiful Code BV, Rotterdam, Netherlands
 * Licensed under GNU GENERAL PUBLIC LICENSE Version 3.
 */

import * as React from "react"

import { ARROW_GEOMETRY } from "./island-geometry"
import { Runner } from "./runner"

export function RunnerView({runner}: { runner: Runner }): JSX.Element {
    const {topFaceLocation, target, state, showDirection} = runner
    const floatView = state.instance.floatView
    return (
        <group>
            <lineSegments geometry={floatView.lineGeometry} onUpdate={self => self.geometry.computeBoundingSphere()}>
                <lineBasicMaterial attach="material" vertexColors={true}/>
            </lineSegments>
            {!showDirection || !topFaceLocation ? undefined : (
                <group>
                    <lineSegments>
                        <bufferGeometry attach="geometry">
                            <bufferAttribute
                                attachObject={["attributes", "position"]}
                                array={new Float32Array([
                                    topFaceLocation.x, topFaceLocation.y, topFaceLocation.z,
                                    target.x, topFaceLocation.y, target.z,
                                ])}
                                count={2}
                                itemSize={3}
                                onUpdate={self => self.needsUpdate = true}
                            />
                        </bufferGeometry>
                        <lineBasicMaterial attach="material" color={"#FFFFFF"}/>
                    </lineSegments>
                    <lineSegments
                        geometry={ARROW_GEOMETRY}
                        quaternion={runner.directionQuaternion}
                        position={topFaceLocation}
                    >
                        <lineBasicMaterial attach="material" color={"#0afdeb"}/>
                    </lineSegments>
                </group>
            )}
        </group>
    )
}

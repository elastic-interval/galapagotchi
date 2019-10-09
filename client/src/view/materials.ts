/*
 * Copyright (c) 2019. Beautiful Code BV, Rotterdam, Netherlands
 * Licensed under GNU GENERAL PUBLIC LICENSE Version 3.
 */

import { Color, DoubleSide, FaceColors, LineBasicMaterial, MeshPhongMaterial, VertexColors } from "three"

export const GOTCHI_GHOST = new MeshPhongMaterial({
    lights: true,
    color: new Color("silver"),
    transparent: true,
    opacity: 0.6,
})

export const GOTCHI = new MeshPhongMaterial({lights: true, color: new Color("silver")})

export const ISLAND = new MeshPhongMaterial({vertexColors: FaceColors, lights: true})

export const HANGER_OCCUPIED = new LineBasicMaterial({color: new Color("black")})

export const HANGER_FREE = new LineBasicMaterial({color: new Color("green")})

export const HOME_HEXALOT = new LineBasicMaterial({color: new Color("white")})

export const AVAILABLE_HEXALOT = new LineBasicMaterial({color: new Color("green")})

export const JOURNEY = new LineBasicMaterial({color: new Color("crimson")})

export const GOTCHI_ARROW = new LineBasicMaterial({color: new Color("magenta")})

export const SELECTED_POINTER = new LineBasicMaterial({color: new Color("yellow")})

export const SURFACE = new MeshPhongMaterial({
    color: new Color("#7a7628"),
    lights: true,
    side: DoubleSide,
    opacity: 0.25,
    transparent: true,
})

export const LINE = new LineBasicMaterial({
    vertexColors: VertexColors,
})

export const FACE = new MeshPhongMaterial({
    lights: true,
    color: new Color("white"),
    side: DoubleSide,
    transparent: true,
    opacity: 0.2,
})

const BAR_COLOR = "#920000"
const CABLE_COLOR = "#3b6ab8"

export function intervalColor(bar: boolean): string {
    return bar ? BAR_COLOR : CABLE_COLOR
}

export const ATTENUATED = new MeshPhongMaterial({
    lights: true,
    color: new Color("#0f0f0f"),
})

export const BAR = new MeshPhongMaterial({
    lights: true,
    color: new Color(BAR_COLOR),
})

export const CABLE = new MeshPhongMaterial({
    lights: true,
    color: new Color(CABLE_COLOR),
})

export const FACE_SPHERE = new MeshPhongMaterial({
    lights: true,
    color: new Color("#bb1722"),
})

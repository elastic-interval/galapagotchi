import {BehaviorSubject} from "rxjs/BehaviorSubject"
import {Vector3} from "three"

import {AppStorage} from "../app-storage"
import {IGotchiFactory} from "../gotchi/gotchi"

import {Hexalot, hexalotTreeString} from "./hexalot"
import {IslandMode, IslandState} from "./island-state"
import {ADJACENT, BRANCH_STEP, HEXALOT_SHAPE, STOP_STEP} from "./shapes"
import {coordSort, equals, ICoords, plus, Spot, spotsToString, Surface, zero} from "./spot"

export interface IslandPattern {
    hexalots: string
    spots: string
}

const sortSpotsOnCoord = (a: Spot, b: Spot): number => coordSort(a.coords, b.coords)

function hexalotWithMaxNonce(hexalots: Hexalot[]): Hexalot | undefined {
    const maxNonce = (withMax: Hexalot | undefined, adjacent: Hexalot) => withMax ? adjacent.nonce > withMax.nonce ? adjacent : withMax : adjacent
    return hexalots.reduce(maxNonce, undefined)
}

export class Island {
    public spots: Spot[] = []
    public hexalots: Hexalot[] = []

    constructor(
        public islandName: string,
        public islandStateSubject: BehaviorSubject<IslandState>,
        private gotchiFactory: IGotchiFactory,
        private appStorage: AppStorage,
    ) {
        this.apply(appStorage.getIsland(islandName))
        this.refreshStructure()
    }

    public get isLegal(): boolean {
        return !this.spots.find(spot => !spot.legal)
    }

    public get freeHexalot(): Hexalot | undefined {
        return this.hexalots.find(hexalot => !hexalot.genome)
    }

    public findHexalot(fingerprint: string): Hexalot | undefined {
        return this.hexalots.find(hexalot => hexalot.id === fingerprint)
    }

    public refreshStructure(): void {
        this.spots.forEach(spot => {
            spot.adjacentSpots = this.getAdjacentSpots(spot)
            spot.connected = spot.adjacentSpots.length < 6
        })
        let flowChanged = true
        while (flowChanged) {
            flowChanged = false
            this.spots.forEach(spot => {
                if (!spot.connected) {
                    const connectedByAdjacent = spot.adjacentSpots
                        .find(adj => (adj.surface === spot.surface) && adj.connected)
                    if (connectedByAdjacent) {
                        spot.connected = true
                        flowChanged = true
                    }
                }
            })
        }
        const firstHexalot = this.hexalots.length === 1
        this.spots.forEach(spot => spot.refresh(firstHexalot, !!spot.centerOfHexalot))
        if (firstHexalot && !this.isLegal) {
            this.hexalots[0].centerSpot.available = false
        }
        this.hexalots.forEach(hexalot => hexalot.refreshFingerprint())
        if (this.islandStateSubject) { // refresh if there is a state
            const islandMode = this.isLegal ? IslandMode.Visiting : IslandMode.FixingIsland
            this.islandStateSubject.next(this.islandStateSubject.getValue().setIslandMode(islandMode))
        }
    }

    public save(): void {
        if (this.isLegal) {
            this.appStorage.setIsland(this.islandName, this.pattern)
            console.log(`Saved ${this.islandName}`)
        } else {
            console.log(`Not legal yet: ${this.islandName}`)
        }
    }

    public removeFreeHexalots(): void {
        const deadHexalots = this.hexalots.filter(hexalot => !hexalot.genome)
        deadHexalots.forEach(deadHexalot => {
            this.hexalots = this.hexalots.filter(hexalot => !equals(hexalot.coords, deadHexalot.coords))
            deadHexalot.destroy().forEach(deadSpot => {
                this.spots = this.spots.filter(spot => !equals(spot.coords, deadSpot.coords))
            })
        })
    }

    public createHexalot(spot: Spot): Hexalot | undefined {
        if (!spot.available) {
            console.error(`${JSON.stringify(spot.coords)} cannot be a hexalot!`)
            return undefined
        }
        return this.hexalotAroundSpot(spot)
    }

    public get midpoint(): Vector3 {
        return this.spots
            .reduce((sum: Vector3, spot: Spot) => sum.add(spot.center), new Vector3())
            .multiplyScalar(1 / this.spots.length)
    }

    public get pattern(): IslandPattern {
        if (!this.isLegal) {
            throw new Error("Saving illegal island")
        }
        this.spots.sort(sortSpotsOnCoord)
        return {
            hexalots: hexalotTreeString(this.hexalots),
            spots: spotsToString(this.spots),
        } as IslandPattern
    }

    // ================================================================================================

    private apply(pattern: IslandPattern): void {
        let hexalot: Hexalot | undefined = this.getOrCreateHexalot(undefined, zero)
        const stepStack = pattern.hexalots.split("").reverse().map(stepChar => Number(stepChar))
        const hexalotStack: Hexalot[] = []
        while (stepStack.length > 0) {
            const step = stepStack.pop()
            switch (step) {
                case STOP_STEP:
                    hexalot = hexalotStack.pop()
                    break
                case BRANCH_STEP:
                    if (hexalot) {
                        hexalotStack.push(hexalot)
                    }
                    break
                case 1:
                case 2:
                case 3:
                case 4:
                case 5:
                case 6:
                    if (hexalot) {
                        hexalot = this.hexalotAroundSpot(hexalot.spots[step])
                    }
                    break
                default:
                    console.error("Error step")
            }
        }
        const hexChars = pattern.spots ? pattern.spots.split("") : []
        const numbers = hexChars.map(hexChar => parseInt(hexChar, 16))
        const booleanArrays = numbers.map(nyb => {
            const b0 = (nyb & 8) !== 0
            const b1 = (nyb & 4) !== 0
            const b2 = (nyb & 2) !== 0
            const b3 = (nyb & 1) !== 0
            return [b0, b1, b2, b3]
        })
        const landStack = [].concat.apply([], booleanArrays).reverse()
        this.spots.sort(sortSpotsOnCoord)
        if (landStack.length) {
            this.spots.forEach(spot => {
                const land = landStack.pop()
                spot.surface = land ? Surface.Land : Surface.Water
            })
        } else if (this.hexalots.length === 1) {
            const singleHexalot = this.hexalots[0]
            singleHexalot.spots.map(spot => spot.surface = Math.random() > 0.5 ? Surface.Land : Surface.Water)
            singleHexalot.spots[0].surface = Surface.Land
        }
        this.hexalots.forEach(lot => lot.load())
    }

    private hexalotAroundSpot(spot: Spot): Hexalot {
        return this.getOrCreateHexalot(hexalotWithMaxNonce(spot.adjacentHexalots), spot.coords)
    }

    private getOrCreateHexalot(parent: Hexalot | undefined, coords: ICoords): Hexalot {
        const existing = this.hexalots.find(existingHexalot => equals(existingHexalot.coords, coords))
        if (existing) {
            return existing
        }
        const spots = HEXALOT_SHAPE.map(c => this.getOrCreateSpot(plus(c, coords)))
        const hexalot = new Hexalot(parent, coords, spots, this.gotchiFactory, this.appStorage)
        this.hexalots.push(hexalot)
        return hexalot
    }

    private getOrCreateSpot(coords: ICoords): Spot {
        const existing = this.getSpot(coords)
        if (existing) {
            return existing
        }
        const spot = new Spot(coords)
        this.spots.push(spot)
        return spot
    }

    private getAdjacentSpots(spot: Spot): Spot[] {
        const adjacentSpots: Spot[] = []
        const coords = spot.coords
        ADJACENT.forEach(a => {
            const adjacentSpot = this.getSpot(plus(a, coords))
            if (adjacentSpot) {
                adjacentSpots.push(adjacentSpot)
            }
        })
        return adjacentSpots
    }

    private getSpot(coords: ICoords): Spot | undefined {
        return this.spots.find(p => equals(p.coords, coords))
    }
}

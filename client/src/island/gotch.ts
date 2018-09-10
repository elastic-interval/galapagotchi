import {
    BRANCH_STEP,
    equals,
    ERROR_STEP,
    getGotchTransform,
    getListGotchTransform,
    ICoords,
    lightsToHexString,
    ringIndex,
    STOP_STEP
} from './constants';
import {Cell} from './cell';

export class Gotch {
    public owner: string;
    public nonce = 0;
    public visited = false;
    public childGotches: Gotch[] = [];
    public transform: string;

    constructor(public parentGotch: Gotch | undefined,
                public coords: ICoords,
                public lights: Cell[],
                index: number) {
        this.lights[0].centerOfGotch = this;
        for (let neighbor = 1; neighbor <= 6; neighbor++) {
            this.lights[neighbor].adjacentGotches.push(this);
        }
        this.lights.forEach(p => p.memberOfGotch.push(this));
        if (parentGotch) {
            parentGotch.childGotches.push(this);
            this.nonce = parentGotch.nonce + 1;
        }
        this.transform = index < 0 ? getGotchTransform(coords) : getListGotchTransform(index);
    }

    get canBePurchased(): boolean {
        const center = this.lights[0];
        const noneAdjacent = center.adjacentGotches.length === 0;
        const ownedAdjacentExists = !!center.adjacentGotches.find(gotch => !!gotch.owner);
        const notOwned = !this.owner;
        return (noneAdjacent || ownedAdjacentExists) && notOwned;
    }

    // get rotated(): Gotch {
    //   return new Gotch(
    //     this.parentGotch, this.coords,
    //     this.cells.map((p: Cell, index: number, lookup: Array<Cell>) => lookup[ROTATE[index]]),
    //     this.ownerLookup
    //   );
    // }

    public destroy(): Cell[] {
        if (this.lights.length === 0) {
            return [];
        }
        if (this.parentGotch) {
            this.parentGotch.childGotches = this.parentGotch.childGotches.filter(gotch => !equals(this.coords, gotch.coords));
        }
        this.lights[0].centerOfGotch = undefined;
        for (let neighbor = 1; neighbor <= 6; neighbor++) {
            this.lights[neighbor].adjacentGotches = this.lights[neighbor].adjacentGotches.filter(gotch => !equals(this.coords, gotch.coords));
        }
        this.lights.forEach(p => p.memberOfGotch = p.memberOfGotch.filter(gotch => !equals(this.coords, gotch.coords)));
        const lightsToRemove = this.lights.filter(p => p.memberOfGotch.length === 0);
        this.lights = [];
        return lightsToRemove;
    }

    public createFingerprint() {
        return lightsToHexString(this.lights);
    }

    public generateOctalTreePattern(steps: number[]): number[] {
        const remainingChildren = this.childGotches.filter(gotch => !gotch.visited)
            .map(gotch => [ringIndex(gotch.coords, this.coords), gotch])
            .sort((a, b) => a[0] < b[0] ? 1 : a[0] > b[0] ? -1 : 0);
        if (remainingChildren.length > 0) {
            while (remainingChildren.length > 0) {
                const child = remainingChildren.pop();
                if (child) {
                    const childGotch = child[1] as Gotch;
                    const index = child[0] as number;
                    if (remainingChildren.length > 0) {
                        steps.push(BRANCH_STEP);
                    }
                    steps.push(index > 0 ? index : ERROR_STEP);
                    childGotch.generateOctalTreePattern(steps);
                }
            }
        }
        else {
            steps.push(STOP_STEP);
        }
        this.visited = true;
        return steps;
    }
}

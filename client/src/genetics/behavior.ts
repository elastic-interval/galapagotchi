import {GeneSequence} from './gene-sequence';
import {Fabric, INTERVALS_RESERVED} from '../body/fabric';

export class Behavior {

    constructor(private fabric: Fabric, private behaviorGene: GeneSequence) {
    }

    public apply(): void {
        // const muscleStateCount = this.fabric.muscleCount;
        // for (let muscleStateIndex = 0; muscleStateIndex < muscleStateCount; muscleStateIndex++) {
        //     const direction = this.behaviorGene.nextChoice(4);
        //     const highLow = this.behaviorGene.nextChoice(256);
        //     this.fabric.setMuscleHighLow(muscleStateIndex, direction, highLow);
        //     // console.log(`MS${muscleStateIndex}= ${spanVariation}`);
        // }
        // const opposite = this.behaviorGene.next() > 0.3;
        // for (let interval = 0; interval < this.fabric.intervalCount / 4; interval++) {
        //     const maxIntervalChoice = this.fabric.intervalCount - INTERVALS_RESERVED;
        //     const intervalChoice = INTERVALS_RESERVED + this.behaviorGene.nextChoice(maxIntervalChoice);
        //     const intervalMuscle = this.behaviorGene.nextChoice(muscleStateCount) * (opposite ? -1 : 1);
        //     // const intervalMuscle = this.behaviorGene.nextChoice(muscleStateCount * 2 - 1) - muscleStateCount + 1;
        //     // console.log(`I[${intervalChoice}]=${intervalMuscle}`);
        //     this.fabric.setIntervalMuscle(intervalChoice, intervalMuscle);
        // }
        console.log('behavior', this.behaviorGene);
        for (let interval = INTERVALS_RESERVED; interval < this.fabric.intervalCount; interval++) {
            this.fabric.setIntervalMuscle(interval, 0);
        }
    }
}
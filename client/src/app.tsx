import * as React from 'react';
import {IFabricExports, turn} from './body/fabric-exports';
import {Island} from './island/island';
import {Fabric} from './body/fabric';
import {Gotchi} from './gotchi/gotchi';
import {Genome, IGenomeData} from './genetics/genome';
import {Vector3} from 'three';
import {Physics} from './body/physics';
import {Spot} from './island/spot';
import {Evolution, INITIAL_JOINT_COUNT} from './gotchi/evolution';
import {Gotch} from './island/gotch';
import {BehaviorSubject} from 'rxjs/BehaviorSubject';
import {OrbitState} from './view/orbit';
import {AppStorage} from './app-storage';
import {Subscription} from 'rxjs/Subscription';
import {Trip} from './island/trip';
import {ActionsPanel, Command} from './view/actions-panel';
import {GotchiView} from './view/gotchi-view';
import {InfoPanel} from './view/info-panel';
import {Button} from 'reactstrap';

interface IAppProps {
    createFabricInstance: () => Promise<IFabricExports>;
    storage: AppStorage;
}

export interface IAppState {
    island: Island;
    width: number;
    height: number;
    infoPanel: boolean;

    master?: string
    orbitState: OrbitState;
    spot?: Spot;
    gotch?: Gotch;
    gotchi?: Gotchi;
    evolution?: Evolution;
    trip?: Trip;
}

const updateDimensions = (): any => {
    return {width: window.innerWidth, height: window.innerHeight};
};

function dispose(state: IAppState) {
    if (state.gotchi) {
        state.gotchi.dispose();
    }
    if (state.evolution) {
        state.evolution.dispose();
    }
}

function startEvolution(gotch: Gotch) {
    return (state: IAppState, props: IAppProps) => {
        dispose(state);
        state.island.setActive(gotch.master);
        const trip = gotch.createStupidTrip();
        return {
            gotchi: undefined,
            evolution: new Evolution(gotch, trip, (genomeData: IGenomeData) => {
                console.log(`Saving genome data`);
                props.storage.setGenome(gotch, genomeData);
            }),
            trip
        };
    };
}

function startGotchi(gotchi: Gotchi) {
    return (state: IAppState) => {
        dispose(state);
        // gotchi.travel = state.trip.createTravel(0);
        return {
            gotchi,
            evolution: undefined,
            trip: undefined
        };
    };
}

function selectSpot(spot?: Spot) {
    const gotch = spot ? spot.centerOfGotch : undefined;
    return (state: IAppState) => {
        dispose(state);
        state.island.setActive();
        return {
            spot,
            gotch,
            gotchi: undefined,
            evolution: undefined,
            trip: undefined
        };
    }
}

class App extends React.Component<IAppProps, IAppState> {
    private subs: Subscription[] = [];
    private orbitStateSubject = new BehaviorSubject<OrbitState>(OrbitState.HELICOPTER);
    private selectedSpotSubject = new BehaviorSubject<Spot | undefined>(undefined);
    private islandState: BehaviorSubject<boolean>;
    private physics: Physics;

    constructor(props: IAppProps) {
        super(props);
        this.physics = new Physics(props.storage);
        this.islandState = new BehaviorSubject<boolean>(false);
        const gotchiFactory = {
            createGotchiAt: (location: Vector3, jointCountMax: number, genome: Genome): Promise<Gotchi> => {
                return this.props.createFabricInstance().then(fabricExports => {
                    this.physics.applyToFabric(fabricExports);
                    const fabric = new Fabric(fabricExports, jointCountMax);
                    fabric.createSeed(location.x, location.z);
                    return new Gotchi(fabric, genome);
                });
            }
        };
        this.state = {
            infoPanel: true,
            orbitState: this.orbitStateSubject.getValue(),
            island: new Island('GalapagotchIsland', this.islandState, gotchiFactory, this.props.storage),
            master: this.props.storage.getMaster(),
            width: window.innerWidth,
            height: window.innerHeight
        };
    }

    public componentDidMount() {
        window.addEventListener("resize", () => this.setState(updateDimensions));
        this.subs.push(this.selectedSpotSubject.subscribe(spot => {
            if (spot && !this.state.evolution && !this.state.gotchi) {
                this.setState(selectSpot(spot));
            }
        }));
        this.subs.push(this.orbitStateSubject.subscribe(orbitState => this.setState({orbitState})));
    }

    public componentWillUnmount() {
        window.removeEventListener("resize", () => this.setState(updateDimensions));
        this.subs.forEach(s => s.unsubscribe());
    }

    public render() {
        return (
            <div className="everything">
                <GotchiView
                    island={this.state.island}
                    width={this.state.width}
                    height={this.state.height}
                    selectedSpot={this.selectedSpotSubject}
                    orbitState={this.orbitStateSubject}
                    gotch={this.state.gotch}
                    evolution={this.state.evolution}
                    trip={this.state.trip}
                    gotchi={this.state.gotchi}
                />
                {!this.state.infoPanel ? null : (
                    <div className="info-panel floating-panel">
                        <div className="info-title">
                            <h3>Galapagotchi Run!</h3>
                            <div className="info-exit">
                                <Button color="link" onClick={() => this.setState({infoPanel: false})}>X</Button>
                            </div>
                        </div>
                        <InfoPanel master={this.state.master}/>
                    </div>
                )}
                <div className="actions-panel floating-panel">
                    <ActionsPanel
                        orbitState={this.state.orbitState}
                        spot={this.state.spot}
                        gotch={this.state.gotch}
                        master={this.state.master}
                        gotchi={this.state.gotchi}
                        evolution={this.state.evolution}
                        do={(command: Command) => this.executeCommand(command)}
                    />
                </div>
            </div>
        );
    }

    private executeCommand(command: Command) {
        const gotch = this.state.gotch;
        const gotchi = this.state.gotchi;
        switch (command) {
            case Command.RETURN_TO_SEED:
                const selectedSpot = this.selectedSpotSubject.getValue();
                this.selectedSpotSubject.next(selectedSpot); // refresh
                this.setState(selectSpot(selectedSpot));
                break;
            case Command.LAUNCH_GOTCHI:
                if (gotch) {
                    this.state.island.setActive(gotch.master);
                    gotch.createGotchi(INITIAL_JOINT_COUNT).then((freshGotchi: Gotchi) => {
                        this.setState(startGotchi(freshGotchi));
                    });
                }
                break;
            case Command.TURN_LEFT:
                if (gotchi) {
                    gotchi.direction = turn(gotchi.direction, false);
                }
                break;
            case Command.TURN_RIGHT:
                if (gotchi) {
                    gotchi.direction = turn(gotchi.direction, true);
                }
                break;
            case Command.LAUNCH_EVOLUTION:
                if (gotch) {
                    this.state.island.setActive(gotch.master);
                    this.setState(startEvolution(gotch));
                }
                break;
        }
    }
}

export default App;

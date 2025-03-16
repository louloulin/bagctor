/**
 * @bactor/http Supervision
 * 
 * Exports supervision strategies and related functionality
 */

export {
    SupervisorActor,
    SupervisorStrategy,
    OneForOneStrategy,
    AllForOneStrategy,
    type SupervisorDirective,
    type DirectiveFunction,
    type SupervisorStrategyConfig
} from './supervisor';

export {
    HttpError,
    TemporaryError,
    ResourceError,
    FatalError
} from './errors'; 
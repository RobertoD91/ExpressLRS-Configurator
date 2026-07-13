import {
  BuildFirmwareStep,
  BuildFirmwareSubstep,
  BuildJobType,
  BuildProgressNotification,
  BuildProgressNotificationType,
  FlashingMethod,
} from '../../gql/generated/types';
import { reduceNotifications } from './reduceNotifications';

function n(
  type: BuildProgressNotificationType,
  step: BuildFirmwareStep,
  substep?: BuildFirmwareSubstep,
  progress?: number,
): BuildProgressNotification {
  return {
    __typename: 'BuildProgressNotification',
    type,
    step,
    substep,
    progress,
  };
}

const { Info, Error: Err, Success } = BuildProgressNotificationType;
const {
  VERIFYING_BUILD_SYSTEM,
  DOWNLOADING_FIRMWARE,
  BUILDING_FIRMWARE,
  FLASHING_FIRMWARE,
} = BuildFirmwareStep;

const buildPrelude: BuildProgressNotification[] = [
  n(Info, VERIFYING_BUILD_SYSTEM),
  n(Success, VERIFYING_BUILD_SYSTEM),
  n(Info, DOWNLOADING_FIRMWARE),
  n(Success, DOWNLOADING_FIRMWARE),
  n(Info, BUILDING_FIRMWARE, BuildFirmwareSubstep.CompilingFirmware),
  n(Success, BUILDING_FIRMWARE),
];

function flashingStep(notifications: BuildProgressNotification[]) {
  const { steps } = reduceNotifications(
    notifications,
    BuildJobType.Flash,
    FlashingMethod.BetaflightPassthrough,
  );
  return steps.find((s) => s.step === FLASHING_FIRMWARE)!;
}

describe('reduceNotifications', () => {
  it('incident replay: transient TargetMismatch error on a successful re-flash ends completed', () => {
    // The exact notification sequence of the "Flash another" incident: the FC
    // is still in passthrough mode, the parser (pre-fix) emitted a false
    // ERROR+TargetMismatch, then the flash proceeded to a full success. The
    // terminal SUCCESS must clear the transient error — the step ends green,
    // not as "Failed to restart device".
    const notifications = [
      ...buildPrelude,
      n(Info, FLASHING_FIRMWARE, BuildFirmwareSubstep.DetectingDevice),
      n(Info, FLASHING_FIRMWARE, BuildFirmwareSubstep.ConnectingToDevice),
      n(Err, FLASHING_FIRMWARE, BuildFirmwareSubstep.TargetMismatch),
      n(Info, FLASHING_FIRMWARE, BuildFirmwareSubstep.ConnectingToDevice),
      n(Info, FLASHING_FIRMWARE, BuildFirmwareSubstep.ErasingFlash),
      n(Info, FLASHING_FIRMWARE, BuildFirmwareSubstep.WritingFirmware, 0),
      n(Info, FLASHING_FIRMWARE, BuildFirmwareSubstep.WritingFirmware, 50),
      n(Info, FLASHING_FIRMWARE, BuildFirmwareSubstep.WritingFirmware, 100),
      n(Info, FLASHING_FIRMWARE, BuildFirmwareSubstep.VerifyingFirmware),
      n(Info, FLASHING_FIRMWARE, BuildFirmwareSubstep.RestartingDevice),
      n(Success, FLASHING_FIRMWARE),
    ];
    const { steps, activeIdx } = reduceNotifications(
      notifications,
      BuildJobType.Flash,
      FlashingMethod.BetaflightPassthrough,
    );
    expect(steps.map((s) => s.status)).toEqual([
      'completed',
      'completed',
      'completed',
      'completed',
    ]);
    expect(activeIdx).toBe(steps.length);
  });

  it('a red label does not travel with healthy progress after a transient error', () => {
    // Mid-run (before the terminal notification arrives): once healthy INFOs
    // resume after an error, the step must be active again — the incident
    // showed "Failed to write firmware" in red while writing at 15%.
    const step = flashingStep([
      ...buildPrelude,
      n(Err, FLASHING_FIRMWARE, BuildFirmwareSubstep.TargetMismatch),
      n(Info, FLASHING_FIRMWARE, BuildFirmwareSubstep.WritingFirmware, 15),
    ]);
    expect(step.status).toBe('active');
    expect(step.currentSubstep).toBe(BuildFirmwareSubstep.WritingFirmware);
    expect(step.progress).toBe(15);
  });

  it('substep-less terminal ERROR does not inherit the last INFO substep', () => {
    // A genuine failure where only the strategy's bare terminal ERROR arrives:
    // the failure label must be generic, not "Failed to restart device"
    // borrowed from the last healthy INFO.
    const step = flashingStep([
      ...buildPrelude,
      n(Info, FLASHING_FIRMWARE, BuildFirmwareSubstep.RestartingDevice),
      n(Err, FLASHING_FIRMWARE),
    ]);
    expect(step.status).toBe('error');
    expect(step.currentSubstep).toBeUndefined();
  });

  it('substep-less terminal ERROR keeps the substep a prior ERROR set', () => {
    // The parser attributes the failure (e.g. curl timeout → UploadingFirmware),
    // then the strategy emits its trailing bare terminal ERROR. The specific
    // label must survive.
    const step = flashingStep([
      ...buildPrelude,
      n(Info, FLASHING_FIRMWARE, BuildFirmwareSubstep.UploadingFirmware, 48),
      n(Err, FLASHING_FIRMWARE, BuildFirmwareSubstep.UploadingFirmware),
      n(Err, FLASHING_FIRMWARE),
    ]);
    expect(step.status).toBe('error');
    expect(step.currentSubstep).toBe(BuildFirmwareSubstep.UploadingFirmware);
  });

  it('ERROR with explicit substep as last notification is shown', () => {
    const step = flashingStep([
      ...buildPrelude,
      n(Info, FLASHING_FIRMWARE, BuildFirmwareSubstep.UploadingFirmware, 10),
      n(Err, FLASHING_FIRMWARE, BuildFirmwareSubstep.UploadingFirmware),
    ]);
    expect(step.status).toBe('error');
    expect(step.currentSubstep).toBe(BuildFirmwareSubstep.UploadingFirmware);
  });

  it('happy path completes every step', () => {
    const { steps, activeIdx } = reduceNotifications(
      [
        ...buildPrelude,
        n(Info, FLASHING_FIRMWARE, BuildFirmwareSubstep.ConnectingToDevice),
        n(Info, FLASHING_FIRMWARE, BuildFirmwareSubstep.WritingFirmware, 100),
        n(Success, FLASHING_FIRMWARE),
      ],
      BuildJobType.Flash,
      FlashingMethod.UART,
    );
    expect(steps.every((s) => s.status === 'completed')).toBe(true);
    expect(activeIdx).toBe(steps.length);
  });

  it('INFO progress is reflected on the active step', () => {
    const step = flashingStep([
      ...buildPrelude,
      n(Info, FLASHING_FIRMWARE, BuildFirmwareSubstep.WritingFirmware, 42),
    ]);
    expect(step.status).toBe('active');
    expect(step.progress).toBe(42);
  });

  it('build-only jobs have three steps and no flashing step', () => {
    const { steps } = reduceNotifications(
      buildPrelude,
      BuildJobType.Build,
      FlashingMethod.UART,
    );
    expect(steps).toHaveLength(3);
    expect(steps.map((s) => s.step)).not.toContain(FLASHING_FIRMWARE);
  });
});

/* eslint-disable no-console */
/* eslint-disable @typescript-eslint/no-unused-vars */
/* eslint-disable no-await-in-loop */
import Outlet, { OutletPower } from '@sangsangfarm/outlet';
import WaterLevel, { WaterLevelState } from '@sangsangfarm/waterlevel';
import { Message, ModuleClient, Twin } from 'azure-iot-device';
import { DeviceTwin, DeviceTwinState } from '@sangsangfarm/types';
import {
  isEmpty,
  isNotEmpty,
  logger,
  localLogger,
  removeNull,
} from '@sangsangfarm/utils';
import wait from 'waait';

/**
 * 농축액 정보
 */
interface ConcentrateInfo {
  /** 농축액 이름 */
  name: string;
  /** 농축액 사용 유무 */
  power: boolean;
  /** 농축액 비율 */
  ratio: number;
  /** 농축액 기본 투입 시간 */
  baseTime: number;
}

/**
 * 농축액 설정 정보
 */
interface ConcentrateSettingInfo {
  A: ConcentrateInfo;
  B: ConcentrateInfo;
  C: ConcentrateInfo;
  D: ConcentrateInfo;
  E: ConcentrateInfo;
  F: ConcentrateInfo;
  G: ConcentrateInfo;
  H: ConcentrateInfo;
  I: ConcentrateInfo;
  J: ConcentrateInfo;
}

/**
 * 양액 급액 타입
 */
enum FeedMakerFeedType {
  /** 점적 급액 타입 */
  DRIP = 0,
  /** 순환 급액 타입 */
  CIRCULAR = 1,
}

/**
 * 베드 정보
 */
interface BedInfo {
  /** 개별 베드 정보 */
  [index: number]: {
    /** 베드 이름 */
    name: string;
    /** 베드 급액 유무 */
    isFeed: boolean;
    /** 베드 급액 시간 */
    feedTime: number;
  };
  /** 급액 주기 */
  feedPeriod: number;
  /** 금액 펌프 대기 시간 */
  feedWaitTime: number;
}

/** 육묘 정보 */
interface SeedInfo {
  /** 육묘 이름 */
  name: string;
  /** 육묘 사용 유무 */
  use: boolean;
  /** 육묘 자동화 전원 */
  power: boolean;
  /** 육묘 제조 시작 플래그 */
  flag: boolean;
}

/**
 * 양액 제조 정보
 */
interface FeedMakerInfo {
  /** 양액 제조 시작 플래그 */
  flag: boolean;
  /** 양액 제조 전원 */
  power: boolean;
  /** 양액 제조시 양액 투입 허용 유무 (목표 ec의 ⅔보다 적을 경우) */
  supplyAllow: boolean;
  /** 양액 제조시 농축액 넣는 횟수 */
  supplyNum: number;
  /** 양액 제조시 농축액 1회 투입시 대기 시간 */
  supplyWaitTime: number;
  /** 농축액 설정 정보 */
  concentrateSettingInfo: ConcentrateSettingInfo;
  /** 양액 급액 타입 */
  feedType: FeedMakerFeedType;
  /** 수위 항상 가득 유무 */
  alwaysFull: boolean;
  /** 육묘 정보 */
  seedInfo: SeedInfo;
  /** 베드 수 */
  bedNum: number;
  /** 베드 정보 */
  bedInfo: BedInfo;
}

/** 양액 제조 twin 정보 */
type FeedMakerTwinProperty = FeedMakerInfo;

/**
 * 콘센트 정보
 */
export enum OutletInfo {
  /** 급액 펌프 */
  FEED_PUMP_OUTLET,
  /** 급수 밸브 */
  WATER_VALVE_OUTLET,
  /** 교반 펌프 */
  STIR_PUMP_OUTLET,
  /** A제 농축액 펌프 */
  A_PUMP_OUTLET,
  /** B제 농축액 펌프 */
  B_PUMP_OUTLET,
  /** C제 농축액 펌프 */
  C_PUMP_OUTLET,
  /** D제 농축액 펌프 */
  D_PUMP_OUTLET,
  /** E제 농축액 펌프 */
  E_PUMP_OUTLET,
  /** F제 농축액 펌프 */
  F_PUMP_OUTLET,
  /** G제 농축액 펌프 */
  G_PUMP_OUTLET,
  /** H제 농축액 펌프 */
  H_PUMP_OUTLET,
  /** I제 농축액 (산) 펌프 */
  I_PUMP_OUTLET,
  /** J제 농축액 (청소액) 펌프 */
  J_PUMP_OUTLET,
  /** 스페어 급액 펌프 */
  SPARE_FEED_PUMP_OUTLET,
  /** 육묘 급액 펌프 */
  SEED_FEED_PUMP_OUTLET,
  /** 육묘 LED */
  SEED_LED_OUTLET,
  /** 육묘 급수 밸브 */
  SEED_WATER_VALVE_OUTLET,
  /** 육묘 양액 밸브 */
  SEED_NUTRIENT_SOLUTION_VALVE_OUTLET,
  /** 기준 베드 밸브  */
  BASE_BED_VALVE_OUTLET,
}

/**
 * 수위 정보
 */
export enum WaterLevelInfo {
  /** 양액 탱크 수위 */
  FEED_TANK_WATER_LEVEL,
  /** A제 탱크 수위 */
  A_TANK_WATER_LEVEL,
  /** B제 탱크 수위 */
  B_TANK_WATER_LEVEL,
  /** C제 탱크 수위 */
  C_TANK_WATER_LEVEL,
  /** D제 탱크 수위 */
  D_TANK_WATER_LEVEL,
  /** E제 탱크 수위 */
  E_TANK_WATER_LEVEL,
  /** F제 탱크 수위 */
  F_TANK_WATER_LEVEL,
  /** G제 탱크 수위 */
  G_TANK_WATER_LEVEL,
  /** H제 탱크 수위 */
  H_TANK_WATER_LEVEL,
  /** I제 (산) 탱크 수위 */
  I_TANK_WATER_LEVEL,
  /** J제 (청소액) 탱크 수위 */
  J_TANK_WATER_LEVEL,
  /** 육묘 탱크 수위 */
  SEED_TANK_WATER_LEVEL,
}

/** 초 */
const SEC = 1000;

/** 기본 콘센트 수 */
const BasicOutletNum = 18;

/** 수위 수 */
const WaterLevelNum = 12;

/** 최대 제조 딜레이 */
const MaxMakeDelay = 60;

/**
 * FeedMaker
 */
export default class FeedMaker {
  private outlet: Outlet;

  private waterlevel: WaterLevel;

  private info: FeedMakerInfo = {
    flag: false,
    power: false,
    supplyAllow: true,
    supplyNum: 1,
    supplyWaitTime: 210,
    concentrateSettingInfo: {
      A: { name: 'null', power: false, ratio: 1, baseTime: 180 },
      B: { name: 'null', power: false, ratio: 1, baseTime: 180 },
      C: { name: 'null', power: false, ratio: 1, baseTime: 180 },
      D: { name: 'null', power: false, ratio: 1, baseTime: 180 },
      E: { name: 'null', power: false, ratio: 1, baseTime: 180 },
      F: { name: 'null', power: false, ratio: 1, baseTime: 180 },
      G: { name: 'null', power: false, ratio: 1, baseTime: 180 },
      H: { name: 'null', power: false, ratio: 1, baseTime: 180 },
      I: { name: 'null', power: false, ratio: 1, baseTime: 180 },
      J: { name: 'null', power: false, ratio: 1, baseTime: 180 },
    },
    feedType: FeedMakerFeedType.DRIP,
    alwaysFull: false,
    seedInfo: {
      name: '',
      use: false,
      power: false,
      flag: false,
    },
    bedNum: 0,
    bedInfo: { feedPeriod: 60 * 60 * 24, feedWaitTime: 60 * 60 * 24 * 365 },
  };

  private client: ModuleClient;

  private twin: Twin;

  private makeBlock = false;

  private dripFeedBlock = false;

  private circularFeedBlock = false;

  private seedBlock = false;

  private debug = false;

  private feedCount = 0;

  private makeStartTime = 0;

  private makeEndTime = 0;

  private makeDelayCount = 0;

  /**
   * FeedMaker 생성자
   * @param client azure-iot-device module client ({@link ModuleClient})
   * @param twin azure-iot-device module twin ({@link Twin})
   * @param debug 디버그 모드 (default : false)
   */
  constructor(client: ModuleClient, twin: Twin, debug = false) {
    this.client = client;
    this.twin = twin;
    this.debug = debug;

    this.info.flag = false;
    this.info.power = false;
    this.info.supplyNum = 1;
    this.info.supplyWaitTime = 210;

    // 수위 초기화
    this.waterlevel = new WaterLevel(0x20, WaterLevelNum, client, debug);

    // 양액 탱크 수위 설정
    this.waterlevel.setPins(WaterLevelInfo.FEED_TANK_WATER_LEVEL, 0, [0, 1], 2);
    this.waterlevel.setMinLevel(WaterLevelInfo.FEED_TANK_WATER_LEVEL, 0);
    this.waterlevel.setMaxLevel(WaterLevelInfo.FEED_TANK_WATER_LEVEL, 2);
    this.waterlevel.setMaxCount(WaterLevelInfo.FEED_TANK_WATER_LEVEL, 1);

    // 농축액 탱크 수위 설정
    for (
      let i = WaterLevelInfo.A_TANK_WATER_LEVEL;
      i <= WaterLevelInfo.J_TANK_WATER_LEVEL;
      i += 1
    ) {
      this.waterlevel.setPins(i, 0, [i + 1], 1);
      this.waterlevel.setMinLevel(i, 0);
      this.waterlevel.setMaxLevel(i, 1);
      this.waterlevel.setMaxCount(i, 1);
    }

    // 육묘 탱크 수위 설정
    this.waterlevel.setPins(
      WaterLevelInfo.SEED_TANK_WATER_LEVEL,
      0,
      [12, 13, 14],
      3
    );
    this.waterlevel.setMinLevel(WaterLevelInfo.SEED_TANK_WATER_LEVEL, 0);
    this.waterlevel.setMaxLevel(WaterLevelInfo.SEED_TANK_WATER_LEVEL, 3);
    this.waterlevel.setMaxCount(WaterLevelInfo.SEED_TANK_WATER_LEVEL, 1);

    // 콘센트 초기화
    this.outlet = new Outlet(0x21, BasicOutletNum, client, twin, debug);

    // 급액 펌프 설정
    this.outlet.setTimerInterval(OutletInfo.FEED_PUMP_OUTLET, 600);
    this.outlet.setOnOffInterval(OutletInfo.FEED_PUMP_OUTLET, 30);

    // 육묘 LED 설정
    this.outlet.setTimerInterval(OutletInfo.SEED_LED_OUTLET, 86400 * 365);
    this.outlet.setOnOffInterval(OutletInfo.SEED_LED_OUTLET, 86400 * 365);
  }

  /**
   * 양액 제조 시작 플래그 설정
   * @param flag 설정할 양액 제조 시작 플래그
   */
  setFlag(flag: boolean): void {
    this.info.flag = flag;

    this.log(
      'info',
      `양액 제조 시작 플래그가 ${
        this.getFlag() ? '켜졌습니다.' : '꺼졌습니다.'
      }`
    );
    this.sendMessage('flag', this.getFlag());
  }

  /**
   * 양액 제조 시작 플래그 가져오기
   * @returns true : 양액 제조 시작 false : 양액 제조 안함
   */
  getFlag(): boolean {
    return this.info.flag;
  }

  /**
   * 양액 제조 전원 설정
   * @param power 설정할 양액 제조 전원
   */
  setPower(power: boolean): void {
    this.info.power = power;
    this.log(
      'info',
      `양액 자동화가 ${this.getPower() ? '켜졌습니다.' : '꺼졌습니다.'}`,
      true
    );
    this.sendMessage('power', this.getPower());
    if (!this.getPower()) {
      this.controlOutlet(OutletInfo.WATER_VALVE_OUTLET, OutletPower.OFF);
    }
  }

  /**
   * 양액 제조 전원 가져오기
   * @returns true : 양액 제조 전원 켜짐 / false: 양액 제조 전원 꺼짐
   */
  getPower(): boolean {
    return this.info.power;
  }

  /**
   * 양액 제조시 양액 투입 허용 유무 설정
   * @param supplyAllow 양액 제조시 양액 투입 허용 유무
   */
  setSupplyAllow(supplyAllow: boolean): void {
    this.info.supplyAllow = supplyAllow;
  }

  /**
   * 양액 제조시 양액 투입 허용 유무 가져오기
   * @returns 양액 제조시 양액 투입 허용 유무
   */
  getSupplyAllow(): boolean {
    return this.info.supplyAllow;
  }

  /**
   * 양액 제조시 농축액 넣는 횟수 설정
   * @param supplyNum 설정할 양액 제조시 농축액 넣는 횟수
   */
  setSupplyNum(supplyNum: number): void {
    this.info.supplyNum = supplyNum;

    this.log(
      'info',
      `양액 공급 횟수가 ${this.getSupplyNum()}(으)로 설정 되었습니다.`
    );
    this.sendMessage('supplyNum', this.getSupplyNum());
  }

  /**
   * 양액 제조시 농축액 넣는 횟수 가져오기
   * @returns 양액 제조시 농축액 넣는 횟수
   */
  getSupplyNum(): number {
    return this.info.supplyNum;
  }

  /**
   * 양액 제조시 농축액 1회 투입시 대기 시간 설정
   * @param supplyWaitTime 설정할 양액 제조시 농축액 1회 투입시 대기 시간 (단위 :초)
   */
  setSupplyWaitTime(supplyWaitTime: number): void {
    this.info.supplyWaitTime = supplyWaitTime;

    this.log(
      'info',
      `농축액 1회 투입 대기 시간이 ${this.getSupplyWaitTime()}(으)로 설정 되었습니다.`
    );
    this.sendMessage('supplyWaitTime', this.getSupplyWaitTime());
  }

  /**
   * 양액 제조시 농축액 1회 투입시 대기 시간 가져오기
   * @returns 양액 제조시 농축액 1회 투입시 대기 시간
   */
  getSupplyWaitTime(): number {
    return this.info.supplyWaitTime;
  }

  /**
   * 농축액 설정 정보 설정
   * @param concentrateSettingInfo 설정할 농축액 설정 정보
   */
  setConcentrateSettingInfo(
    concentrateSettingInfo: ConcentrateSettingInfo
  ): void {
    if (concentrateSettingInfo.A) {
      this.info.concentrateSettingInfo = removeNull({
        ...this.info.concentrateSettingInfo,
        A: removeNull({
          ...this.info.concentrateSettingInfo.A,
          ...concentrateSettingInfo.A,
        }),
      });
    }

    if (concentrateSettingInfo.B) {
      this.info.concentrateSettingInfo = removeNull({
        ...this.info.concentrateSettingInfo,
        B: removeNull({
          ...this.info.concentrateSettingInfo.B,
          ...concentrateSettingInfo.B,
        }),
      });
    }

    if (concentrateSettingInfo.C) {
      this.info.concentrateSettingInfo = removeNull({
        ...this.info.concentrateSettingInfo,
        C: removeNull({
          ...this.info.concentrateSettingInfo.C,
          ...concentrateSettingInfo.C,
        }),
      });
    }

    if (concentrateSettingInfo.D) {
      this.info.concentrateSettingInfo = removeNull({
        ...this.info.concentrateSettingInfo,
        D: removeNull({
          ...this.info.concentrateSettingInfo.D,
          ...concentrateSettingInfo.D,
        }),
      });
    }

    if (concentrateSettingInfo.E) {
      this.info.concentrateSettingInfo = removeNull({
        ...this.info.concentrateSettingInfo,
        E: removeNull({
          ...this.info.concentrateSettingInfo.E,
          ...concentrateSettingInfo.E,
        }),
      });
    }

    if (concentrateSettingInfo.F) {
      this.info.concentrateSettingInfo = removeNull({
        ...this.info.concentrateSettingInfo,
        F: removeNull({
          ...this.info.concentrateSettingInfo.F,
          ...concentrateSettingInfo.F,
        }),
      });
    }

    if (concentrateSettingInfo.G) {
      this.info.concentrateSettingInfo = removeNull({
        ...this.info.concentrateSettingInfo,
        G: removeNull({
          ...this.info.concentrateSettingInfo.G,
          ...concentrateSettingInfo.G,
        }),
      });
    }

    if (concentrateSettingInfo.H) {
      this.info.concentrateSettingInfo = removeNull({
        ...this.info.concentrateSettingInfo,
        H: removeNull({
          ...this.info.concentrateSettingInfo.H,
          ...concentrateSettingInfo.H,
        }),
      });
    }

    if (concentrateSettingInfo.I) {
      this.info.concentrateSettingInfo = removeNull({
        ...this.info.concentrateSettingInfo,
        I: removeNull({
          ...this.info.concentrateSettingInfo.I,
          ...concentrateSettingInfo.I,
        }),
      });
    }

    if (concentrateSettingInfo.J) {
      this.info.concentrateSettingInfo = removeNull({
        ...this.info.concentrateSettingInfo,
        J: removeNull({
          ...this.info.concentrateSettingInfo.J,
          ...concentrateSettingInfo.J,
        }),
      });
    }

    this.log(
      'info',
      `농축액 설정이 ${JSON.stringify(
        this.getConcentrateSettingInfo()
      )}(으)로 설정 되었습니다.`
    );
    this.sendMessage(
      'concentrateSettingInfo',
      JSON.stringify(this.getConcentrateSettingInfo())
    );
  }

  /**
   * 농축액 설정 정보 가져오기
   * @returns 농축액 설정 정보
   */
  getConcentrateSettingInfo(): ConcentrateSettingInfo {
    return this.info.concentrateSettingInfo;
  }

  /**
   * 양액 급액 타입 설정
   * @param feedType 설정할 양액 급액 타입 (0 : 점적 / 1 : 순환)
   */
  setFeedType(feedType: FeedMakerFeedType): void {
    this.info.feedType = feedType;

    this.log(
      'info',
      `양액 급액 타입이 ${
        this.getFeedType() === FeedMakerFeedType.DRIP ? '점적' : '순환'
      }(으)로 설정 되었습니다.`
    );
    this.sendMessage('feedType', this.getFeedType());
  }

  /**
   * 양액 급액 타입 가져오기
   * @returns 양액 급액 타입 (0 : 점적 / 1 : 순환)
   */
  getFeedType(): FeedMakerFeedType {
    return this.info.feedType;
  }

  /**
   * 항상 물 가득 채우는 지 유무 설정
   * @param alwaysFull 항상 물 가득 채우는 지 유무
   */
  setAlwaysFull(alwaysFull: boolean): void {
    this.info.alwaysFull = alwaysFull;
  }

  /**
   * 항상 물 가득 채우는 지 유무 가져오기
   * @returns 항상 물 가득 채우는 지 유무
   */
  getAlwaysFull(): boolean {
    return this.info.alwaysFull;
  }

  /**
   * 육묘 정보 설정
   * @param seedInfo 설정할 육묘 정보
   */
  setSeedInfo(seedInfo: SeedInfo): void {
    this.info.seedInfo = { ...this.getSeedInfo(), ...seedInfo };
    this.sendMessage('seedInfo', JSON.stringify(this.getSeedInfo()));
  }

  /**
   * 육묘 정보 가져오기
   * @returns 육묘 정보
   */
  getSeedInfo(): SeedInfo {
    return this.info.seedInfo;
  }

  /**
   * 베드 수 설정
   * @param bedNum 설정할 베드 수
   */
  setBedNum(bedNum: number): void {
    this.info.bedNum = bedNum;

    this.outlet = new Outlet(
      0x21,
      BasicOutletNum + this.getBedNum(),
      this.client,
      this.twin,
      this.debug
    );

    this.log('info', `베드 수를 ${this.getBedNum()}개로 설정 되었습니다.`);
    this.sendMessage('bedNum', this.getBedNum());
  }

  /**
   * 베드 수 가져오기
   * @returns 베드 수
   */
  getBedNum(): number {
    return this.info.bedNum;
  }

  /**
   * 베드 정보 설정
   * @param bedInfo 설정할 베드 정보
   */
  setBedInfo(bedInfo: BedInfo): void {
    this.info.bedInfo = removeNull({
      ...this.info.bedInfo,
      ...bedInfo,
    });

    this.log('info', `베드 설정을 ${this.getBedInfo()}(으)로 설정 되었습니다.`);
    this.sendMessage('bedInfo', JSON.stringify(this.getBedInfo()));
  }

  /**
   * 베드 정보 가져오기
   * @returns bed info 베드 정보
   */
  getBedInfo(): BedInfo {
    return this.info.bedInfo;
  }

  /**
   * 콘센트 데이터 가져오기
   * @returns 콘센트 데이터 {@link Outlet}
   */
  getOutlet(): Outlet {
    return this.outlet;
  }

  /**
   * 콘센트 전원 제어
   * @param index 콘센트 번호
   * @param power 설정할 콘센트 전원
   * @param log 로그 내용
   */
  private controlOutlet(
    index: number,
    power: OutletPower,
    log: string | null = null
  ): void {
    const outletPowerToBoolean = power === OutletPower.ON;
    if (this.outlet.getPower(index) !== outletPowerToBoolean) {
      this.outlet.setPower(index, power);

      if (log) {
        logger.log('info', log);
      }
    }
  }

  /**
   * 수위 데이터 가져오기
   * @returns 수위 데이터 {@link WaterLevel}
   */
  getWaterLevel(): WaterLevel {
    return this.waterlevel;
  }

  static getConcentrateTankName(
    outletInfo: OutletInfo
  ): 'A' | 'B' | 'C' | 'D' | 'E' | 'F' | 'G' | 'H' | 'I' | 'J' {
    let name: 'A' | 'B' | 'C' | 'D' | 'E' | 'F' | 'G' | 'H' | 'I' | 'J' = 'A';
    switch (outletInfo) {
      default:
      case OutletInfo.A_PUMP_OUTLET:
        name = 'A';
        break;
      case OutletInfo.B_PUMP_OUTLET:
        name = 'B';
        break;
      case OutletInfo.C_PUMP_OUTLET:
        name = 'C';
        break;
      case OutletInfo.D_PUMP_OUTLET:
        name = 'D';
        break;
      case OutletInfo.E_PUMP_OUTLET:
        name = 'E';
        break;
      case OutletInfo.F_PUMP_OUTLET:
        name = 'F';
        break;
      case OutletInfo.G_PUMP_OUTLET:
        name = 'G';
        break;
      case OutletInfo.H_PUMP_OUTLET:
        name = 'H';
        break;
      case OutletInfo.I_PUMP_OUTLET:
        name = 'I';
        break;
      case OutletInfo.J_PUMP_OUTLET:
        name = 'J';
        break;
    }
    return name;
  }

  /**
   * Azure IotHub device desired twin property 파싱
   * @param desiredFeedMaker desired feedmaker twin ({@link FeedMakerTwinProperty})
   */
  private parseFromDesiredTwin(desiredFeedMaker: FeedMakerTwinProperty): void {
    if (isEmpty(desiredFeedMaker) || Object.keys(desiredFeedMaker).length < 0) {
      return;
    }

    const {
      power,
      supplyNum,
      supplyWaitTime,
      concentrateSettingInfo,
      feedType,
      alwaysFull,
      seedInfo,
      bedNum,
      bedInfo,
    } = desiredFeedMaker;

    if (isNotEmpty(power)) {
      this.setPower(power);
    }

    if (isNotEmpty(supplyNum)) {
      this.setSupplyNum(supplyNum);
    }

    if (isNotEmpty(supplyWaitTime)) {
      this.setSupplyWaitTime(supplyWaitTime);
    }

    if (isNotEmpty(concentrateSettingInfo)) {
      this.setConcentrateSettingInfo(concentrateSettingInfo);
    }

    if (isNotEmpty(seedInfo)) {
      this.setSeedInfo(seedInfo);
    }

    if (isNotEmpty(feedType)) {
      this.setFeedType(feedType);
    }

    if (isNotEmpty(alwaysFull)) {
      this.setAlwaysFull(alwaysFull);
    }

    if (isNotEmpty(bedNum)) {
      this.setBedNum(bedNum);
    }

    if (isNotEmpty(bedInfo)) {
      this.setBedInfo(bedInfo);
    }
  }

  /**
   * Azure IotHub device reported twin property 파싱
   * @param reportedFeedMaker reported feedmaker twin ({@link FeedMakerTwinProperty})
   */
  private parseFromReportedTwin(
    reportedFeedMaker: FeedMakerTwinProperty
  ): void {
    if (
      isEmpty(reportedFeedMaker) ||
      Object.keys(reportedFeedMaker).length < 0
    ) {
      return;
    }

    const { flag } = reportedFeedMaker;

    if (isNotEmpty(flag)) {
      this.setFlag(flag);
    }
  }

  /**
   * Azure IotHub device twin property 파싱
   * @param twin device twin ({@link DeviceTwin})
   * @param twinState 디바이스 트윈 업데이트 상태 ({@link DeviceTwinState})
   */
  parseFromTwin(twin: DeviceTwin, twinState: DeviceTwinState): void {
    if (twinState === DeviceTwinState.UPDATE_COMPLETE && twin.properties) {
      const desiredFeedMaker: FeedMakerTwinProperty = twin.properties.desired
        .feedMaker as FeedMakerTwinProperty;
      const reportedFeedMaker: FeedMakerTwinProperty = twin.properties.reported
        .feedMaker as FeedMakerTwinProperty;
      this.parseFromDesiredTwin(desiredFeedMaker);
      this.parseFromReportedTwin(reportedFeedMaker);
    } else {
      const desiredFeedMaker: FeedMakerTwinProperty =
        twin.feedMaker as FeedMakerTwinProperty;
      this.parseFromDesiredTwin(desiredFeedMaker);
    }
    this.getOutlet().parseFromTwin(twin, twinState);
    this.getWaterLevel().parseFromTwin(twin, twinState);
  }

  /**
   * Azure IoTHub 메세지 보내기
   * @param name 값 이름
   * @param value 값
   */
  private sendMessage(name: string, value: number | boolean | string): void {
    const message = {
      messageType: 'feedMaker',
      deviceID: process.env.IOTEDGE_DEVICEID,
      name,
      value,
    };

    const ms = new Message(JSON.stringify(message));
    this.client.sendOutputEvent('feedMaker', ms, (err, _que) => {
      if (err) {
        this.log('error', err);
        return;
      }
      this.log('info', `send message: ${JSON.stringify(message)}`);
    });
  }

  /**
   * Azure IotHub device report twin property 보내기
   * @param body FeedMaker 정보 (Partial<{@link FeedMakerInfo}>)
   */
  private sendReport(body: Partial<FeedMakerInfo>) {
    const patch = { feedMaker: body };
    this.twin.properties.reported.update(patch, (err: Error) => {
      if (err) {
        this.log('error', err);
        throw err;
      }
    });
  }

  /**
   * 양액 제조 속성 가져오기
   * @returns 양액 제조 속성
   */
  getProperty(): FeedMakerTwinProperty {
    const property: FeedMakerTwinProperty = {
      flag: this.getFlag(),
      power: this.getPower(),
      supplyAllow: this.getSupplyAllow(),
      supplyNum: this.getSupplyNum(),
      supplyWaitTime: this.getSupplyWaitTime(),
      concentrateSettingInfo: this.getConcentrateSettingInfo(),
      feedType: this.getFeedType(),
      alwaysFull: this.getAlwaysFull(),
      seedInfo: this.getSeedInfo(),
      bedNum: this.getBedNum(),
      bedInfo: this.getBedInfo(),
    };
    return property;
  }

  /**
   * 모든 베드 밸브 잠그기
   */
  offAllBedValve(): void {
    for (let i = 0; i < this.getBedNum(); i += 1) {
      this.controlOutlet(OutletInfo.BASE_BED_VALVE_OUTLET + i, OutletPower.OFF);
    }
  }

  /**
   * 농축액 비율 및 투입 시간 확인
   */
  checkRatioAndTime(): void {
    let maxOnOffInterval = 0;

    for (
      let index = OutletInfo.A_PUMP_OUTLET;
      index <= OutletInfo.J_PUMP_OUTLET;
      index += 1
    ) {
      const tankString = FeedMaker.getConcentrateTankName(index);
      const concentrateInfo = this.getConcentrateSettingInfo()[tankString];

      if (!this.outlet.getTimer(index)) {
        this.outlet.setTimer(index, true);
      }

      if (isNotEmpty(concentrateInfo)) {
        const { ratio, baseTime } = concentrateInfo;
        const lastOnOffInterval = this.outlet.getOnOffInterval(index);
        const newOnoffInterval = ratio * baseTime;
        if (
          !Number.isNaN(newOnoffInterval) &&
          lastOnOffInterval !== newOnoffInterval
        ) {
          this.outlet.setOnOffInterval(index, newOnoffInterval);
        }
      }

      maxOnOffInterval = Math.max(
        maxOnOffInterval,
        this.outlet.getOnOffInterval(index)
      );
    }

    if (this.getSupplyWaitTime() !== maxOnOffInterval + 30) {
      this.setSupplyWaitTime(maxOnOffInterval + 30);
    }
  }

  /**
   * 공급 펌프 동기화 - 메인, 스페어 2개
   */
  syncFeedPump(): void {
    // 타이머 동기화
    const timer = this.outlet.getTimer(OutletInfo.FEED_PUMP_OUTLET);
    const spareTimer = this.outlet.getTimer(OutletInfo.SPARE_FEED_PUMP_OUTLET);
    if (timer !== spareTimer) {
      this.outlet.setTimer(OutletInfo.SPARE_FEED_PUMP_OUTLET, timer);
    }

    // On Off 주기 동기화
    const onOffInterval = this.outlet.getOnOffInterval(
      OutletInfo.FEED_PUMP_OUTLET
    );
    const spareOnOffInterval = this.outlet.getOnOffInterval(
      OutletInfo.SPARE_FEED_PUMP_OUTLET
    );
    if (onOffInterval !== spareOnOffInterval) {
      this.outlet.setOnOffInterval(
        OutletInfo.SPARE_FEED_PUMP_OUTLET,
        onOffInterval
      );
    }

    // timer 주기 동기화
    const timerInterval = this.outlet.getTimerInterval(
      OutletInfo.FEED_PUMP_OUTLET
    );
    const spareTimerInterval = this.outlet.getTimerInterval(
      OutletInfo.SPARE_FEED_PUMP_OUTLET
    );
    if (timerInterval !== spareTimerInterval) {
      this.outlet.setTimerInterval(
        OutletInfo.SPARE_FEED_PUMP_OUTLET,
        timerInterval
      );
    }

    // 최근 켜진 시간 동기화
    const lastTimeTurnOn = this.outlet.getLastTimeTurnOn(
      OutletInfo.FEED_PUMP_OUTLET
    );
    const spareLastTimeTurnOn = this.outlet.getLastTimeTurnOn(
      OutletInfo.SPARE_FEED_PUMP_OUTLET
    );
    if (lastTimeTurnOn !== spareLastTimeTurnOn) {
      this.outlet.setLastTimeTurnOn(
        OutletInfo.SPARE_FEED_PUMP_OUTLET,
        lastTimeTurnOn
      );
    }

    // 전원 동기화
    const power = this.outlet.getPower(OutletInfo.FEED_PUMP_OUTLET);
    const sparePower = this.outlet.getPower(OutletInfo.SPARE_FEED_PUMP_OUTLET);
    if (power !== sparePower) {
      this.outlet.setPower(
        OutletInfo.SPARE_FEED_PUMP_OUTLET,
        power ? OutletPower.ON : OutletPower.OFF
      );
    }
  }

  setFeedPump(power: OutletPower): void {
    if (power) {
      this.controlOutlet(OutletInfo.FEED_PUMP_OUTLET, OutletPower.ON);
      this.controlOutlet(OutletInfo.SPARE_FEED_PUMP_OUTLET, OutletPower.ON);
    } else {
      this.controlOutlet(OutletInfo.FEED_PUMP_OUTLET, OutletPower.OFF);
      this.controlOutlet(OutletInfo.SPARE_FEED_PUMP_OUTLET, OutletPower.OFF);
    }
  }

  setFeedPumpTimer(timer: boolean): void {
    if (timer) {
      if (this.outlet.getTimer(OutletInfo.FEED_PUMP_OUTLET) === false) {
        this.outlet.setTimer(OutletInfo.FEED_PUMP_OUTLET, true);
      }
      if (this.outlet.getTimer(OutletInfo.SPARE_FEED_PUMP_OUTLET) === false) {
        this.outlet.setTimer(OutletInfo.SPARE_FEED_PUMP_OUTLET, true);
      }
    } else {
      if (this.outlet.getTimer(OutletInfo.FEED_PUMP_OUTLET) === true) {
        this.outlet.setTimer(OutletInfo.FEED_PUMP_OUTLET, false);
      }
      if (this.outlet.getTimer(OutletInfo.SPARE_FEED_PUMP_OUTLET) === true) {
        this.outlet.setTimer(OutletInfo.SPARE_FEED_PUMP_OUTLET, false);
      }
    }
  }

  /** 점적 급액 */
  dripFeed(): void {
    if (this.dripFeedBlock && this.getFeedType() !== FeedMakerFeedType.DRIP) {
      return;
    }

    this.dripFeedBlock = true;

    const power = this.getPower();

    // 자동화가 켜져 있고, 양액 제조 중이 아닐 때, 양액 급액 펌프 타이머 켜기
    if (power && !this.getFlag()) {
      this.setFeedPumpTimer(true);
    }
    // 자동화가 꺼져있거나, 양액 제조중일 때, 양액 급액 펌프 타이머 끄고 펌프 끄기
    else {
      this.setFeedPumpTimer(false);
      this.setFeedPump(OutletPower.OFF);
    }

    this.dripFeedBlock = false;
  }

  /** 순환 급액 */
  async circularFeed(): Promise<void> {
    if (
      this.circularFeedBlock ||
      this.getFeedType() !== FeedMakerFeedType.CIRCULAR
    ) {
      return;
    }

    this.circularFeedBlock = true;
    this.feedCount += 1;

    const bedNum = this.getBedNum();
    const { feedPeriod, feedWaitTime } = this.getBedInfo();

    this.setFeedPumpTimer(false);

    // 급액 주기 아닐 경우 넘어가기
    if (this.feedCount % feedPeriod !== 0) {
      // 급액 펌프 끄기
      this.setFeedPump(OutletPower.OFF);
      this.offAllBedValve();
      return;
    }

    // 급액 펌프 켜기
    this.setFeedPump(OutletPower.ON);

    for (let i = 0; i < bedNum; i += 1) {
      // 양액 제조시 금액 중단
      if (this.getFlag()) {
        this.setFeedPump(OutletPower.OFF);
        this.offAllBedValve();
        break;
      }

      this.offAllBedValve();

      const bedInfo = this.getBedInfo();
      const { isFeed, feedTime } = bedInfo[i];
      if (isFeed) {
        this.outlet.setPower(
          OutletInfo.BASE_BED_VALVE_OUTLET + i,
          OutletPower.ON
        );
        this.feedCount += feedTime;
        await wait(feedTime * SEC);
        this.outlet.setPower(
          OutletInfo.BASE_BED_VALVE_OUTLET + i,
          OutletPower.OFF
        );
      }
    }

    this.setFeedPump(OutletPower.OFF);

    this.feedCount += feedWaitTime;
    await wait(feedWaitTime * SEC);

    this.circularFeedBlock = false;
  }

  /**
   * 양액 제조 자동화 시작
   */
  async make(): Promise<void> {
    if (this.makeBlock) {
      return;
    }

    this.makeBlock = true;

    this.checkRatioAndTime();

    const feedTankState = this.waterlevel.getState(
      WaterLevelInfo.FEED_TANK_WATER_LEVEL
    );

    const { power, supplyNum, supplyWaitTime } = this.info;

    // 자동화가 켜져있을 경우
    if (power) {
      // 양액 탱크 수위 부족 하면 물 채우고 양액 제조 시작 플래그 켜기
      if (
        feedTankState === WaterLevelState.LACK_WATER_LEVEL &&
        !this.getFlag()
      ) {
        this.makeStartTime = new Date().getTime();

        // ! 양액 급액량과 회수량의 불균형 방지를 위해 급수 안함.
        if (
          isNotEmpty(process.env.FEED_MAKER_MAKE_DEALY) &&
          process.env.FEED_MAKER_MAKE_DEALY.toLowerCase() === 'true'
        ) {
          this.setFlag(true);
          this.sendReport({ flag: this.getFlag() });

          this.makeBlock = false;
          return;
        }

        this.setFlag(true);
        this.sendReport({ flag: this.getFlag() });
        this.controlOutlet(
          OutletInfo.WATER_VALVE_OUTLET,
          OutletPower.ON,
          '양액 탱크 물 부족 - 물 공급 시작'
        );
      }

      // 양액 제조 시작 플래그 켜져 있을 때
      if (this.getFlag()) {
        // ! 양액 급액량과 회수량의 불균형 방지를 위해 대기 (60초)
        if (
          isNotEmpty(process.env.FEED_MAKER_MAKE_DEALY) &&
          process.env.FEED_MAKER_MAKE_DEALY.toLowerCase() === 'true'
        ) {
          if (this.makeDelayCount < MaxMakeDelay) {
            this.makeDelayCount += 1;
            logger.log(
              'info',
              `양액 제조 대기 ${this.makeDelayCount} / ${MaxMakeDelay}`
            );
            if (feedTankState !== WaterLevelState.LACK_WATER_LEVEL) {
              logger.log(
                'info',
                '양액 제조 스킵 - 양액 급액 회수량 불균형 방지'
              );
              this.setFlag(false);
              this.sendReport({ flag: this.getFlag() });
              this.makeDelayCount = 0;
            }

            this.makeBlock = false;
            return;
          }
        }

        // 물 채우다가 도중에 재부팅 또는 멈춘 경우 다시 채우기
        if (feedTankState !== WaterLevelState.FLOOD_WATER_LEVEL) {
          this.controlOutlet(
            OutletInfo.WATER_VALVE_OUTLET,
            OutletPower.ON,
            '양액 탱크 물 부족 - 물 공급 재 시작'
          );
        }

        // 물 다 채웠으면 급수 밸브 잠구고, 교반 펌프 작동 시작후, A, B, C, D, E, F, G, H제 공급
        if (feedTankState === WaterLevelState.FLOOD_WATER_LEVEL) {
          this.controlOutlet(
            OutletInfo.WATER_VALVE_OUTLET,
            OutletPower.OFF,
            '양액 탱크 수위 가득 - 물 공급 중단'
          );

          this.outlet.setIsSetLastTimeTurnOnProperty(
            OutletInfo.STIR_PUMP_OUTLET,
            true
          );

          this.setFlag(false);
          this.sendReport({ flag: this.getFlag() });
          this.makeDelayCount = 0;

          if (
            isNotEmpty(process.env.FEED_MAKER_MAKE_DEALY) &&
            process.env.FEED_MAKER_MAKE_DEALY.toLowerCase() === 'true'
          ) {
            this.makeStartTime += MaxMakeDelay * SEC;
          }

          this.makeEndTime = new Date().getTime();
          const makeTime = this.makeEndTime - this.makeStartTime;
          this.log(
            'info',
            `makeTime : ${makeTime} makeStartTime : ${this.makeStartTime} makeEndTime : ${this.makeEndTime}`
          );

          if (this.getSupplyAllow() && makeTime > MaxMakeDelay * SEC) {
            this.log('info', '양액 제조를 시작합니다.', true);

            this.controlOutlet(
              OutletInfo.STIR_PUMP_OUTLET,
              OutletPower.ON,
              '양액 교반 펌프 작동 시작'
            );

            // 정해진 횟수만큼 A, B, C, D, E, F, G, H 공급
            for (let i = 0; i < supplyNum; i += 1) {
              this.log('info', `${i + 1}회차 농축액 공급 시작.`, true);
              for (
                let index = OutletInfo.A_PUMP_OUTLET;
                index <= OutletInfo.H_PUMP_OUTLET;
                index += 1
              ) {
                const tankString = FeedMaker.getConcentrateTankName(index);
                const concentrateInfo =
                  this.getConcentrateSettingInfo()[tankString];

                if (isNotEmpty(concentrateInfo) && concentrateInfo.power) {
                  this.outlet.setIsSetLastTimeTurnOnProperty(index, true);
                  this.outlet.setPower(index, OutletPower.ON);
                  this.log('info', `${tankString}제 펌프 작동 시작.`);
                } else {
                  this.log('info', `${tankString}제 펌프 작동 안함.`);
                }
              }
              await wait(supplyWaitTime * SEC); // eslint-disable-line no-await-in-loop
              this.log('info', `${i + 1} 회차 농축액 공급 완료.`, true);
            }
            this.log('info', '양액 제조가 완료 되었습니다.', true);
          }
        }
      }
      // 항상 물 가득 채우기 설정 되어 있을 경우, 물 가득 차면 물 공급 밸브 불가
      else if (this.getAlwaysFull()) {
        if (feedTankState === WaterLevelState.FLOOD_WATER_LEVEL) {
          this.controlOutlet(OutletInfo.WATER_VALVE_OUTLET, OutletPower.OFF);
        }
      }
      // 양액 제조 시작 플래그 꺼져 있고,
      // 항상 물 가득 채우기 설정 안되어 있을 경우
      // 물 공급 밸브 불가
      else {
        this.controlOutlet(OutletInfo.WATER_VALVE_OUTLET, OutletPower.OFF);
      }
    }
    // 자동화가 꺼져있을 경우 수동 급수시 넘침 방지
    else {
      // 양액 탱크 수위가 가득 차거나 에러 발생시 급수 중단
      switch (feedTankState) {
        case WaterLevelState.LACK_WATER_LEVEL:
        case WaterLevelState.GOOD_WATER_LEVEL:
          break;
        case WaterLevelState.NONE_WATER_LEVEL:
        case WaterLevelState.FLOOD_WATER_LEVEL:
        case WaterLevelState.ERROR_WATER_LEVEL:
        default:
          this.controlOutlet(OutletInfo.WATER_VALVE_OUTLET, OutletPower.OFF);
          break;
      }
    }

    this.makeBlock = false;
  }

  async seed(): Promise<void> {
    const seedInfo = this.getSeedInfo();

    const level = this.waterlevel.getLevel(
      WaterLevelInfo.SEED_TANK_WATER_LEVEL
    );

    // 수위 부족시 무조건 끄기
    if (level === 0) {
      if (this.outlet.getPower(OutletInfo.SEED_FEED_PUMP_OUTLET)) {
        this.outlet.setPower(OutletInfo.SEED_FEED_PUMP_OUTLET, OutletPower.OFF);
      }
      if (this.outlet.getTimer(OutletInfo.SEED_FEED_PUMP_OUTLET)) {
        this.outlet.setTimer(OutletInfo.SEED_FEED_PUMP_OUTLET, false);
      }
    }

    if (this.seedBlock || !seedInfo.power || !seedInfo.use) {
      this.controlOutlet(OutletInfo.SEED_WATER_VALVE_OUTLET, OutletPower.OFF);
      this.controlOutlet(
        OutletInfo.SEED_NUTRIENT_SOLUTION_VALVE_OUTLET,
        OutletPower.OFF
      );
      return;
    }

    this.seedBlock = true;

    const { power, flag } = seedInfo;

    // 양액 자동화 켜져있으면, 수위 체크해서 자동 보충
    if (power) {
      // 제조 플래그 켜져있으면, 자동 보충 실시
      if (flag) {
        if (this.outlet.getPower(OutletInfo.SEED_FEED_PUMP_OUTLET)) {
          this.outlet.setPower(
            OutletInfo.SEED_FEED_PUMP_OUTLET,
            OutletPower.OFF
          );
        }
        if (this.outlet.getTimer(OutletInfo.SEED_FEED_PUMP_OUTLET)) {
          this.outlet.setTimer(OutletInfo.SEED_FEED_PUMP_OUTLET, false);
        }

        switch (level) {
          case 0: // 급수 시작 - 육묘 양액 공급 중단
          case 1:
            this.controlOutlet(
              OutletInfo.SEED_WATER_VALVE_OUTLET,
              OutletPower.ON
            );
            this.controlOutlet(
              OutletInfo.SEED_NUTRIENT_SOLUTION_VALVE_OUTLET,
              OutletPower.OFF
            );
            break;
          case 2: // 육묘 급수 중단, 육묘 양액 공급 시작
            this.controlOutlet(
              OutletInfo.SEED_WATER_VALVE_OUTLET,
              OutletPower.OFF
            );
            this.controlOutlet(
              OutletInfo.SEED_NUTRIENT_SOLUTION_VALVE_OUTLET,
              OutletPower.ON
            );
            break;
          case 3: // 완료 - 육묘 급수, 육묘 양액 공급 중단
          default:
            this.controlOutlet(
              OutletInfo.SEED_WATER_VALVE_OUTLET,
              OutletPower.OFF
            );
            this.controlOutlet(
              OutletInfo.SEED_NUTRIENT_SOLUTION_VALVE_OUTLET,
              OutletPower.OFF
            );
            this.setSeedInfo({ ...this.getSeedInfo(), flag: false });
            this.log('info', '육묘 양액 제조가 완료 되었습니다.', true);
            break;
        }
      }
      // 제조 플래그 꺼져있고, 레벨이 0일 경우 플래그 켜기
      else if (!flag && level === 0) {
        this.setSeedInfo({ ...this.getSeedInfo(), flag: true });
        this.log('info', '육묘 양액 제조를 시작합니다.', true);
      }
      // 제조 플래그 꺼져있을 경우 급액 펌프 자동화 가동
      else if (!this.outlet.getTimer(OutletInfo.SEED_FEED_PUMP_OUTLET)) {
        this.outlet.setTimer(OutletInfo.SEED_FEED_PUMP_OUTLET, true);
      }
    }
    // 육묘 자동화 꺼져있으면, 육묘 급수 밸브, 육묘 양액 밸브 잠그기
    else {
      this.controlOutlet(OutletInfo.SEED_WATER_VALVE_OUTLET, OutletPower.OFF);
      this.controlOutlet(
        OutletInfo.SEED_NUTRIENT_SOLUTION_VALVE_OUTLET,
        OutletPower.OFF
      );
    }

    this.seedBlock = false;
  }

  /**
   * 양액 제조 로그
   *
   * @param level 로그 레벨
   * @param message 로그 메세지
   * @param useLocalLogger 로컬 로그 사용 유뮤
   * @param optionalParams 파라미터
   */
  private log(
    level: string,
    message?: unknown,
    useLocalLogger = false,
    ...optionalParams: unknown[]
  ): void {
    if (this.debug) {
      logger.log(level, message as string, ...optionalParams, {
        label: 'FeedMaker',
      });
    }

    if (useLocalLogger) {
      localLogger.log(message as string);
    }
  }
}

/* eslint-disable no-console */
/* eslint-disable @typescript-eslint/no-unused-vars */
/* eslint-disable no-await-in-loop */

import { OutletPower } from '@sangsangfarm/outlet';
import { DeviceTwin, DeviceTwinState } from '@sangsangfarm/types';
import { isEmpty, isNotEmpty, logger } from '@sangsangfarm/utils';
import { WaterLevelState } from '@sangsangfarm/waterlevel';
import { Message, ModuleClient } from 'azure-iot-device';
import ModbusRTU from 'modbus-serial';
import FeedMaker, { OutletInfo, WaterLevelInfo } from './feedMaker';

/**
 * 양액 측정 정보
 */
interface MeasurerInfo {
  /** 양액 측정 전원 */
  power: boolean;
  /** 양액 EC */
  ec: number | null;
  /** 양액 pH */
  ph: number | null;
  /** 목표 양액 EC */
  targetEC: number | null;
  /** 목표 양액 pH */
  targetPH: number | null;
  /** 측정을 위한 물 보충 주기 */
  wateringTime: number;
  /** 양액 측정 주기 */
  measurementTime: number;
  /** 양액 보정 주기 */
  calibrationTime: number;
  /** 양액 EC 센서 온도 */
  ecTemperature: number | null;
  /** 양액 pH 센서 온도 */
  phTemperature: number | null;
  /** 양액 수온 */
  waterTemperature: number | null;
  /** 양액 EC 센서 연결 상태 */
  ecStatus: boolean;
  /** 양액 pH 센서 연결 상태 */
  phStatus: boolean;
}

/** 양액 측정 twin 정보 */
type MeasurerTwinProperty = Pick<
  MeasurerInfo,
  | 'power'
  | 'targetEC'
  | 'targetPH'
  | 'ec'
  | 'ph'
  | 'wateringTime'
  | 'measurementTime'
  | 'calibrationTime'
>;

export default class Measurer {
  private info: MeasurerInfo = {
    power: true,
    ec: null,
    ph: null,
    targetEC: null,
    targetPH: null,
    measurementTime: 600, // 10분
    wateringTime: 3600, // 1시간
    calibrationTime: -1, // 보정 안함
    ecTemperature: null,
    phTemperature: null,
    waterTemperature: null,
    ecStatus: false,
    phStatus: false,
  };

  private client: ModuleClient;

  private block = false;

  private debug = false;

  private feedMaker: FeedMaker;

  private measureCount = 0;

  private calibrationCount = 0;

  private modbus: ModbusRTU;

  private isFirstMeasure = true;

  private isEcCalibrated = false;

  private measureNum = 5;

  /**
   *
   * @param client azure-iot-device module client ({@link ModuleClient})
   * @param feedMaker 양액 제조 객체 ({@link FeedMaker})
   * @param debug 디버그 모드 (default : false)
   */
  constructor(client: ModuleClient, feedMaker: FeedMaker, debug = false) {
    this.client = client;
    this.feedMaker = feedMaker;

    this.debug = debug;

    this.modbus = new ModbusRTU();
    this.modbus.connectRTUBuffered('/dev/ttyUSB0', {
      baudRate: 9600,
      dataBits: 8,
      stopBits: 1,
      parity: 'none',
    });
    this.modbus.setTimeout(2000);
  }

  /**
   * 양액 측정 전원 설정
   * @param power 설정할 양액 측정 전원
   */
  setPower(power: boolean): void {
    this.info.power = power;
    this.sendMessage('power', this.getPower());
  }

  /**
   * 양액 측정 전원 가져오기
   * @returns true : 양액 측정 전원 켜짐 / false: 양액 측정 전원 꺼짐
   */
  getPower(): boolean {
    return this.info.power;
  }

  /**
   * 양액 EC 설정
   * @param ec 설정할 양액 EC
   */
  setEC(ec: number | null): void {
    this.info.ec = ec;
    if (ec) {
      this.sendMessage('ec', ec);
    }
  }

  /**
   * 양액 EC 가져오기
   * @returns 양액 EC
   */
  getEC(): number | null {
    return this.info.ec;
  }

  /**
   * 양액 pH 설정
   * @param ph 설정할 양액 pH
   */
  setPH(ph: number | null): void {
    this.info.ph = ph;
    if (ph) {
      this.sendMessage('ph', ph);
    }
  }

  /**
   * 양액 pH 가져오기
   * @returns 양액 pH
   */
  getPH(): number | null {
    return this.info.ph;
  }

  /**
   * 목표 양액 EC 설정
   * @param targetEC 설정할 목표 양액 EC
   */
  setTargetEC(targetEC: number | null): void {
    this.info.targetEC = targetEC;
    if (targetEC) {
      this.sendMessage('targetEC', targetEC);
    }
  }

  /**
   * 목표 양액 EC 가져오기
   * @returns 목표 양액 EC
   */
  getTargetEC(): number | null {
    return this.info.targetEC;
  }

  /**
   * 목표 양액 pH 설정
   * @param targetPH 설정할 목표 양액 pH
   */
  setTargetPH(targetPH: number | null): void {
    this.info.targetPH = targetPH;
    if (targetPH) {
      this.sendMessage('targetPH', targetPH);
    }
  }

  /**
   * 목표 양액 pH 가져오기
   * @returns 목표 양액 pH
   */
  getTargetPH(): number | null {
    return this.info.targetPH;
  }

  /**
   * 양액 측정 주기 설정
   * @param measurementTime 설정할 양액 측정 주기
   */
  setMeasurementTime(measurementTime: number): void {
    this.info.measurementTime = measurementTime;
    this.sendMessage('measurementTime', measurementTime);
  }

  /**
   * 측정을 위한 물 보충 주기 가져오기
   * @returns 측정을 위한 물 보충 주기
   */
  getWateringTime(): number {
    return this.info.wateringTime;
  }

  /**
   * 측정을 위한 물 보충 주기 설정
   * @param 측정을 위한 물 보충 주기 설정할 측정을 위한 물 보충 주기
   */
  setWateringTime(wateringTime: number): void {
    this.info.wateringTime = wateringTime;
    // this.sendMessage('wateringTime', wateringTime);
  }

  /**
   * 양액 측정 주기 가져오기
   * @returns 양액 측정 주기
   */
  getMeasurementTime(): number {
    return this.info.measurementTime;
  }

  /**
   * 양액 보정 주기 설정
   * @param calibrationTime 설정할 양액 보정 주기
   */
  setCalibrationTime(calibrationTime: number): void {
    this.info.calibrationTime = calibrationTime;
    this.sendMessage('calibrationTime', calibrationTime);
  }

  /**
   * 양액 보정 주기 가져오기
   * @returns 양액 보정 주기
   */
  getCalibrationTime(): number {
    return this.info.calibrationTime;
  }

  /**
   * 양액 수온 설정
   * @param waterTemperature 설정할 양액 수온
   */
  setWaterTemperature(waterTemperature: number): void {
    if (this.info.waterTemperature !== waterTemperature) {
      this.info.waterTemperature = waterTemperature;
      this.sendMessage('waterTemperature', waterTemperature);
    }
  }

  /**
   * 양액 수온 가져오기
   * @returns 양액 수온
   */
  getWaterTemperature(): number | null {
    const { ecTemperature, phTemperature } = this.info;
    if (ecTemperature) {
      if (phTemperature) {
        this.setWaterTemperature((ecTemperature + phTemperature) / 2);
      } else {
        this.setWaterTemperature(ecTemperature);
      }
    } else if (phTemperature) {
      this.setWaterTemperature(phTemperature);
    } else {
      this.info.waterTemperature = null;
    }

    return this.info.waterTemperature;
  }

  /**
   * 양액 EC 센서 연결 상태 설정
   * @param ph 설정할 양액 EC 센서 연결 상태
   */
  setECStatus(ecStatus: boolean): void {
    this.info.ecStatus = ecStatus;
    this.sendMessage('ecStatus', ecStatus);
  }

  /**
   * 양액 EC 센서 연결 상태 가져오기
   * @returns true: 양액 EC 센서 연결됨 / false: 양액 EC 센서 연결안됨
   */
  getECStatus(): boolean {
    return this.info.ecStatus;
  }

  /**
   * 양액 pH 센서 연결 상태 설정
   * @param ph 설정할 양액 pH 센서 연결 상태
   */
  setPHStatus(phStatus: boolean): void {
    this.info.phStatus = phStatus;
    this.sendMessage('phStatus', phStatus);
  }

  /**
   * 양액 pH 센서 연결 상태 가져오기
   * @returns true: 양액 pH 센서 연결됨 / false: 양액 pH 센서 연결안됨
   */
  getPHStatus(): boolean {
    return this.info.phStatus;
  }

  /**
   * 양액 EC 측정
   */
  private async measureEC(): Promise<void> {
    this.modbus.setID(1);
    this.feedMaker.setSupplyAllow(false);

    const data: { ecTemperature: number; ec: number }[] = [];
    for (let i = 0; i < this.measureNum; i += 1) {
      const result = await this.modbus
        .readInputRegisters(0, 3)
        .catch(() => null);
      if (result && result.data[2] !== 0) {
        data.push({
          ecTemperature: result.data[0] / 100,
          ec: result.data[2],
        });
      }
    }

    if (data.length > 0) {
      if (!this.getECStatus()) {
        this.setECStatus(true);
      }
    } else if (this.getECStatus()) {
      this.setECStatus(false);
    }

    const targetEC = this.getTargetEC() || 0;
    const currentEC = Math.max(...data.map((res) => res.ec));
    this.setEC(currentEC);
    this.info.ecTemperature = Math.min(...data.map((res) => res.ecTemperature));

    if (currentEC <= (targetEC * 2) / 3) {
      this.feedMaker.setSupplyAllow(true);
    }
  }

  /**
   * 양액 pH 측정
   */
  private async measurePH(): Promise<void> {
    this.modbus.setID(2);

    const data: { phTemperature: number; ph: number }[] = [];
    for (let i = 0; i < this.measureNum; i += 1) {
      const result = await this.modbus
        .readInputRegisters(0, 2)
        .catch(() => null);

      if (result && result.data[2] !== 0) {
        data.push({
          phTemperature: result.data[0] / 100,
          ph: result.data[1] / 100,
        });
      }
    }

    if (data.length > 0) {
      if (!this.getPHStatus()) {
        this.setPHStatus(true);
      }
    } else if (this.getPHStatus()) {
      this.setPHStatus(false);
    }

    const currentPH = Math.min(...data.map((res) => res.ph));
    this.setPH(currentPH);
    this.info.phTemperature = Math.min(...data.map((res) => res.phTemperature));

    if (currentPH <= 5.5) {
      this.feedMaker.setSupplyAllow(false);
    }
  }

  /**
   * 양액 측정
   */
  async measure(): Promise<void> {
    const feedTank = this.feedMaker
      .getWaterLevel()
      .getState(WaterLevelInfo.FEED_TANK_WATER_LEVEL);
    switch (feedTank) {
      case WaterLevelState.FLOOD_WATER_LEVEL:
      case WaterLevelState.GOOD_WATER_LEVEL:
        await this.measureEC();
        await this.measurePH();
        this.getWaterTemperature();
        this.sendMessageEcPh();
        break;
      case WaterLevelState.LACK_WATER_LEVEL:
      case WaterLevelState.ERROR_WATER_LEVEL:
      case WaterLevelState.NONE_WATER_LEVEL:
      default:
        break;
    }
  }

  /**
   * Azure IoTHub 메세지 보내기 - EC, pH, 수온 데이터
   */
  sendMessageEcPh(): void {
    if (!this.getECStatus() && !this.getPHStatus()) {
      return;
    }

    const message = {
      messageType: 'ecPh',
      deviceID: process.env.IOTEDGE_DEVICEID,
      time: new Date(),
      ec: this.getEC(),
      ph: this.getPH(),
      waterTemperature: this.getWaterTemperature(),
    };

    const ms = new Message(JSON.stringify(message));
    this.client.sendOutputEvent('measurer', ms, (err, _que) => {
      if (err) {
        this.log('error', err);
        return;
      }
      this.log('info', `send message: ${JSON.stringify(message)}`);
    });
  }

  /**
   * 양액 EC 보정
   */
  calibrationEC(): void {
    const targetEC = this.getTargetEC();
    const ec = this.getEC();
    if (!ec || !targetEC) {
      this.log('info', 'EC 데이터가 없을 경우, 보정 안함.');
      return;
    }

    const needEC = targetEC - ec;
    if (needEC >= 200) {
      this.log('info', 'EC 보정 시작');
      this.isEcCalibrated = true;
      const concentrateSettingInfo = this.feedMaker.getConcentrateSettingInfo();
      const { A, B, C, D, E, F, G, H } = concentrateSettingInfo;
      const outlet = this.feedMaker.getOutlet();
      if (A && A.power) {
        outlet.setIsSetLastTimeTurnOnProperty(OutletInfo.A_PUMP_OUTLET, true);
        outlet.setPower(OutletInfo.A_PUMP_OUTLET, OutletPower.ON);
      }
      if (B && B.power) {
        outlet.setIsSetLastTimeTurnOnProperty(OutletInfo.B_PUMP_OUTLET, true);
        outlet.setPower(OutletInfo.B_PUMP_OUTLET, OutletPower.ON);
      }
      if (C && C.power) {
        outlet.setIsSetLastTimeTurnOnProperty(OutletInfo.C_PUMP_OUTLET, true);
        outlet.setPower(OutletInfo.C_PUMP_OUTLET, OutletPower.ON);
      }
      if (D && D.power) {
        outlet.setIsSetLastTimeTurnOnProperty(OutletInfo.D_PUMP_OUTLET, true);
        outlet.setPower(OutletInfo.D_PUMP_OUTLET, OutletPower.ON);
      }
      if (E && E.power) {
        outlet.setIsSetLastTimeTurnOnProperty(OutletInfo.E_PUMP_OUTLET, true);
        outlet.setPower(OutletInfo.E_PUMP_OUTLET, OutletPower.ON);
      }
      if (F && F.power) {
        outlet.setIsSetLastTimeTurnOnProperty(OutletInfo.F_PUMP_OUTLET, true);
        outlet.setPower(OutletInfo.F_PUMP_OUTLET, OutletPower.ON);
      }
      if (G && G.power) {
        outlet.setIsSetLastTimeTurnOnProperty(OutletInfo.G_PUMP_OUTLET, true);
        outlet.setPower(OutletInfo.G_PUMP_OUTLET, OutletPower.ON);
      }
      if (H && H.power) {
        outlet.setIsSetLastTimeTurnOnProperty(OutletInfo.H_PUMP_OUTLET, true);
        outlet.setPower(OutletInfo.H_PUMP_OUTLET, OutletPower.ON);
      }
    } else {
      this.log('info', 'EC 보정 불필요');
    }
  }

  /**
   * 양액 PH 보정
   */
  calibrationPH(): void {
    const targetPH = this.getTargetPH();
    const ph = this.getPH();
    if (!ph || !targetPH) {
      this.log('info', 'pH 데이터가 없을 경우, 보정 안함.');
      return;
    }

    if (this.isEcCalibrated) {
      this.log('info', 'EC 보정 하였으므로 pH 보정은 다음 주기에 시작.');
      this.isEcCalibrated = false;
      return;
    }

    const needPH = ph - targetPH;
    const outlet = this.feedMaker.getOutlet();

    if (needPH >= 0.3) {
      this.log('info', 'pH 보정 시작');
      const concentrateSettingInfo = this.feedMaker.getConcentrateSettingInfo();
      if (concentrateSettingInfo.A && concentrateSettingInfo.A.power) {
        outlet.setIsSetLastTimeTurnOnProperty(OutletInfo.I_PUMP_OUTLET, true);
        outlet.setPower(OutletInfo.I_PUMP_OUTLET, OutletPower.ON);
      }
    } else {
      this.log('info', 'pH 보정 불필요');
    }
  }

  /**
   * 양액 보정
   */
  async calibration(): Promise<void> {
    if (this.feedMaker.getFlag()) {
      this.log('info', '양액 제조중 양액 보정 안함.');
      return;
    }

    this.isEcCalibrated = false;
    const ph = this.getPH() || 0;
    if (ph > 5.5) {
      this.calibrationEC();
    }
    this.calibrationPH();
    this.log('info', '보정 완료.');
  }

  /**
   * 양액 제조 속성 가져오기
   * @returns 양액 제조 속성
   */
  getProperty(): Omit<MeasurerInfo, 'ecTemperature' | 'phTemperature'> {
    const property: Omit<MeasurerInfo, 'ecTemperature' | 'phTemperature'> = {
      power: this.getPower(),
      ec: this.getEC(),
      ph: this.getPH(),
      targetEC: this.getTargetEC(),
      targetPH: this.getTargetPH(),
      wateringTime: this.getWateringTime(),
      measurementTime: this.getMeasurementTime(),
      calibrationTime: this.getCalibrationTime(),
      waterTemperature: this.getWaterTemperature(),
      ecStatus: this.getECStatus(),
      phStatus: this.getPHStatus(),
    };
    return property;
  }

  /**
   * 양액 측정, 보정 시작
   */
  async run(): Promise<void> {
    if (this.block || !this.getPower()) {
      return;
    }

    const outlet = this.feedMaker.getOutlet();
    const waterlevel = this.feedMaker.getWaterLevel();

    this.block = true;
    if (this.isFirstMeasure) {
      this.isFirstMeasure = false;
      await this.measure();
    }

    // 항상 수위 가득 옵션이 켜져 있고,
    // 기준 시간동안 수위로 인해 측정을 못했고,
    // 수위가 가득이 아닐 경우, 수위 채우기
    if (
      this.feedMaker.getAlwaysFull() &&
      this.measureCount > this.getWateringTime() &&
      waterlevel.getState(WaterLevelInfo.FEED_TANK_WATER_LEVEL) !==
        WaterLevelState.FLOOD_WATER_LEVEL &&
      !outlet.getPower(OutletInfo.WATER_VALVE_OUTLET)
    ) {
      outlet.setPower(OutletInfo.WATER_VALVE_OUTLET, OutletPower.ON);
    }

    if (
      this.getMeasurementTime() > 0 &&
      this.measureCount - this.getMeasurementTime() > 0 &&
      waterlevel.getState(WaterLevelInfo.FEED_TANK_WATER_LEVEL) ===
        WaterLevelState.FLOOD_WATER_LEVEL
    ) {
      await this.measure();
      this.measureCount = 0;
    }

    if (
      this.getCalibrationTime() > 0 &&
      this.calibrationCount - this.getCalibrationTime() > 0
    ) {
      await this.calibration();
      this.calibrationCount = 0;
    }

    this.measureCount += 1;
    this.calibrationCount += 1;

    this.block = false;
  }

  /**
   * Azure IotHub device desired twin property 파싱
   * @param desiredMeasure desired ion measurer twin ({@link MeasurerTwinProperty})
   */
  private parseFromDesiredTwin(desiredMeasure: MeasurerTwinProperty): void {
    if (isEmpty(desiredMeasure) || Object.keys(desiredMeasure).length < 0) {
      return;
    }

    const {
      power,
      targetEC,
      targetPH,
      ec,
      ph,
      wateringTime,
      measurementTime,
      calibrationTime,
    } = desiredMeasure;

    if (isNotEmpty(power)) {
      this.setPower(power);
    }

    if (isNotEmpty(targetEC)) {
      this.setTargetEC(targetEC);
    }

    if (isNotEmpty(targetPH)) {
      this.setTargetPH(targetPH);
    }

    if (isNotEmpty(ec)) {
      this.info.ec = ec;
    }

    if (isNotEmpty(ph)) {
      this.info.ph = ph;
    }

    if (isNotEmpty(wateringTime)) {
      this.setWateringTime(wateringTime);
    }

    if (isNotEmpty(measurementTime)) {
      this.setMeasurementTime(measurementTime);
    }

    if (isNotEmpty(calibrationTime)) {
      this.setCalibrationTime(calibrationTime);
    }
  }

  /**
   * Azure IotHub device reported twin property 파싱
   * @param reportedMeasure reported ion measurer twin ({@link MeasurerTwinProperty})
   */
  private parseFromReportedTwin(reportedMeasure: MeasurerTwinProperty): void {
    this.parseFromDesiredTwin(reportedMeasure);
  }

  /**
   * Azure IotHub device twin property 파싱
   * @param twin device twin ({@link DeviceTwin})
   * @param twinState 디바이스 트윈 업데이트 상태 ({@link DeviceTwinState})
   */
  parseFromTwin(twin: DeviceTwin, twinState: DeviceTwinState): void {
    if (twinState === DeviceTwinState.UPDATE_COMPLETE && twin.properties) {
      const desiredMeasure: MeasurerTwinProperty = twin.properties.desired
        .measurer as MeasurerTwinProperty;
      const reportedMeasure: MeasurerTwinProperty = twin.properties.reported
        .measurer as MeasurerTwinProperty;
      this.parseFromDesiredTwin(desiredMeasure);
      this.parseFromReportedTwin(reportedMeasure);
    } else {
      const desiredMeasure: MeasurerTwinProperty =
        twin.measurer as MeasurerTwinProperty;
      this.parseFromDesiredTwin(desiredMeasure);
    }
  }

  /**
   * Azure IoTHub 메세지 보내기
   * @param name 값 이름
   * @param value 값
   */
  private sendMessage(name: string, value: number | boolean): void {
    const message = {
      messageType: 'measurer',
      deviceID: process.env.IOTEDGE_DEVICEID,
      name,
      value,
    };

    const ms = new Message(JSON.stringify(message));
    this.client.sendOutputEvent('measurer', ms, (err, _que) => {
      if (err) {
        this.log('error', err);
        return;
      }
      this.log('info', `send message: ${JSON.stringify(message)}`);
    });
  }

  /**
   * 양액 측정 로그
   *
   * @param level 로그 레벨
   * @param message 로그 메세지
   * @param optionalParams 파라미터
   */
  private log(
    level: string,
    message?: unknown,
    ...optionalParams: unknown[]
  ): void {
    if (this.debug) {
      logger.log(level, message as string, ...optionalParams, {
        label: 'measurer',
      });
    }
  }
}

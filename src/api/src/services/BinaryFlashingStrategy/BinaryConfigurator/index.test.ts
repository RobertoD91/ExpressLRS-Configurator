import 'reflect-metadata';
import UserDefine from '../../../models/UserDefine';
import UserDefineKey from '../../../library/FirmwareBuilder/Enum/UserDefineKey';
import BinaryConfigurator from './index';

const binaryConfigurator = new BinaryConfigurator(
  null as never,
  null as never,
);

describe('userDefinesToFlags', () => {
  it('passes the auto wifi interval when it is a number', () => {
    const flags = binaryConfigurator.userDefinesToFlags([
      UserDefine.Text(UserDefineKey.AUTO_WIFI_ON_INTERVAL, '60', true),
    ]);
    expect(flags).toEqual([['--auto-wifi', '60']]);
  });

  it('omits --auto-wifi when the enabled interval is empty', () => {
    const flags = binaryConfigurator.userDefinesToFlags([
      UserDefine.Text(UserDefineKey.AUTO_WIFI_ON_INTERVAL, '', true),
    ]);
    expect(flags).toEqual([]);
  });

  it('omits --auto-wifi when the enabled interval is not a number', () => {
    const flags = binaryConfigurator.userDefinesToFlags([
      UserDefine.Text(UserDefineKey.AUTO_WIFI_ON_INTERVAL, ' abc ', true),
    ]);
    expect(flags).toEqual([]);
  });

  it('passes --no-auto-wifi when the option is disabled', () => {
    const flags = binaryConfigurator.userDefinesToFlags([
      UserDefine.Text(UserDefineKey.AUTO_WIFI_ON_INTERVAL, '60', false),
    ]);
    expect(flags).toEqual([['--no-auto-wifi']]);
  });

  it('trims the auto wifi interval', () => {
    const flags = binaryConfigurator.userDefinesToFlags([
      UserDefine.Text(UserDefineKey.AUTO_WIFI_ON_INTERVAL, ' 45 ', true),
    ]);
    expect(flags).toEqual([['--auto-wifi', '45']]);
  });

  it('omits --rx-baud when the enabled value is empty', () => {
    const flags = binaryConfigurator.userDefinesToFlags([
      UserDefine.Text(UserDefineKey.RCVR_UART_BAUD, '', true),
    ]);
    expect(flags).toEqual([]);
  });

  it('passes --rx-baud when the value is a number', () => {
    const flags = binaryConfigurator.userDefinesToFlags([
      UserDefine.Text(UserDefineKey.RCVR_UART_BAUD, '420000', true),
    ]);
    expect(flags).toEqual([['--rx-baud', '420000']]);
  });

  it('strips the LU suffix from the telemetry report interval', () => {
    const flags = binaryConfigurator.userDefinesToFlags([
      UserDefine.Text(UserDefineKey.TLM_REPORT_INTERVAL_MS, '240LU', true),
    ]);
    expect(flags).toEqual([['--tlm-report', '240']]);
  });

  it('omits --tlm-report when the enabled value is empty', () => {
    const flags = binaryConfigurator.userDefinesToFlags([
      UserDefine.Text(UserDefineKey.TLM_REPORT_INTERVAL_MS, '', true),
    ]);
    expect(flags).toEqual([]);
  });
});

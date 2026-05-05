import type { Socket } from 'socket.io';
import { RiskGateway } from './risk.gateway';

type MockServer = { emit: jest.Mock };
type MockSocket = Socket & { emit: jest.Mock };

describe('RiskGateway AI producer authentication', () => {
  const originalEnv = process.env;

  function createGateway() {
    const vehicleCounts = { update: jest.fn() };
    const mongoTelemetry = {
      recordRiskEvent: jest.fn(),
      recordIncidentConfirmed: jest.fn(),
      recordCameraStatus: jest.fn(),
      recordVehicleCounts: jest.fn(),
    };
    const publicGateway = {
      broadcastIncidentToRelevantSessions: jest.fn(),
      broadcastCongestionUpdate: jest.fn(),
    };
    const gateway = new RiskGateway(
      vehicleCounts as never,
      mongoTelemetry as never,
      publicGateway as never,
    );
    const server: MockServer = { emit: jest.fn() };
    gateway.server = server as never;
    return { gateway, vehicleCounts, mongoTelemetry, publicGateway, server };
  }

  function socket(token?: string): MockSocket {
    return {
      id: 'socket-1',
      handshake: { auth: token ? { token } : {}, headers: {} },
      emit: jest.fn(),
    } as unknown as MockSocket;
  }

  beforeEach(() => {
    jest.resetModules();
    process.env = { ...originalEnv, AI_WS_TOKEN: 'secret', NODE_ENV: 'test' };
  });

  afterAll(() => {
    process.env = originalEnv;
  });

  it('accepts authorized AI producer events', () => {
    const { gateway, mongoTelemetry, server } = createGateway();

    gateway.handleRiskEvent(socket('secret'), {
      risk_score: 80,
      risk_level: 'HIGH',
    });

    expect(jest.mocked(mongoTelemetry.recordRiskEvent)).toHaveBeenCalledWith(
      expect.objectContaining({ risk_score: 80 }),
    );
    expect(server.emit).toHaveBeenCalledWith(
      'risk_update',
      expect.objectContaining({ risk_score: 80 }),
    );
  });

  it('rejects missing tokens', () => {
    const { gateway, mongoTelemetry, server } = createGateway();
    const client = socket();

    gateway.handleRiskEvent(client, { risk_score: 80 });

    expect(jest.mocked(mongoTelemetry.recordRiskEvent)).not.toHaveBeenCalled();
    expect(server.emit).not.toHaveBeenCalled();
    expect(client.emit).toHaveBeenCalledWith('producer_error', {
      event: 'risk_event',
      reason: 'unauthorized',
    });
  });

  it('rejects invalid tokens', () => {
    const { gateway, mongoTelemetry, server } = createGateway();

    gateway.handleCameraStatus(socket('wrong'), {
      cam_id: 1,
      status: 'online',
    });

    expect(
      jest.mocked(mongoTelemetry.recordCameraStatus),
    ).not.toHaveBeenCalled();
    expect(server.emit).not.toHaveBeenCalled();
  });

  it('rejects malformed payloads from authorized producers', () => {
    const { gateway, mongoTelemetry, server } = createGateway();
    const client = socket('secret');

    gateway.handleVehicleCounts(client, { total: 1 } as never);

    expect(
      jest.mocked(mongoTelemetry.recordVehicleCounts),
    ).not.toHaveBeenCalled();
    expect(server.emit).not.toHaveBeenCalled();
    expect(client.emit).toHaveBeenCalledWith('producer_error', {
      event: 'vehicle_counts',
      reason: 'malformed_payload',
    });
  });

  it('normalizes incident payloads and derives incident_id when missing', () => {
    const { gateway, mongoTelemetry } = createGateway();

    gateway.handleIncidentConfirmed(socket('secret'), {
      cam_id: 1,
      snapshot: 'snapshot.jpg',
      timestamp: '2026-05-05T12:00:00.000Z',
    });

    expect(
      jest.mocked(mongoTelemetry.recordIncidentConfirmed),
    ).toHaveBeenCalledWith(
      expect.objectContaining<Record<string, unknown>>({
        camera_id: 'cam1',
        incident_type: 'vehicle_collision',
        incident_id: expect.stringMatching(/^derived_/) as unknown as string,
      }),
    );
  });
});

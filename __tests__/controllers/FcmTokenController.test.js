// __tests__/controllers/FcmTokenController.test.js
jest.mock('../../src/models/FcmToken');
jest.mock('../../src/events/NotificationEvents', () => ({
  fireEvent: jest.fn(),
  EVENTS: {},
}));

const FcmToken = require('../../src/models/FcmToken');
const FcmTokenController = require('../../src/controllers/FcmTokenController');

const mockReq = (overrides = {}) => ({
  body: {},
  params: {},
  query: {},
  user: { id: 'user-uuid', role: 'driver' },
  ...overrides,
});

const mockRes = () => {
  const res = {};
  res.status = jest.fn().mockReturnValue(res);
  res.json = jest.fn().mockReturnValue(res);
  return res;
};

describe('FcmTokenController', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  describe('register()', () => {
    it('should return 400 if fcm_token is missing', async () => {
      const req = mockReq({ body: {} });
      const res = mockRes();

      await FcmTokenController.register(req, res);

      expect(res.status).toHaveBeenCalledWith(400);
      expect(res.json).toHaveBeenCalledWith({ message: 'fcm_token is required' });
    });

    it('should return 400 if device_type is invalid', async () => {
      const req = mockReq({ body: { fcm_token: 'tok123', device_type: 'smartwatch' } });
      const res = mockRes();

      await FcmTokenController.register(req, res);

      expect(res.status).toHaveBeenCalledWith(400);
      expect(res.json).toHaveBeenCalledWith(
        expect.objectContaining({ message: expect.stringContaining('device_type must be one of') })
      );
    });

    it('should register token successfully with valid data', async () => {
      const req = mockReq({ body: { fcm_token: 'tok123', device_type: 'android', device_label: 'Pixel' } });
      const res = mockRes();
      const mockToken = { id: 1, fcm_token: 'tok123' };
      FcmToken.upsert.mockResolvedValue(mockToken);

      await FcmTokenController.register(req, res);

      expect(FcmToken.upsert).toHaveBeenCalledWith('user-uuid', 'tok123', 'android', 'Pixel');
      expect(res.status).toHaveBeenCalledWith(200);
      expect(res.json).toHaveBeenCalledWith({ message: 'Token registered', token: mockToken });
    });

    it('should handle register exceptions and return 500', async () => {
      const req = mockReq({ body: { fcm_token: 'tok123' } });
      const res = mockRes();
      FcmToken.upsert.mockRejectedValue(new Error('DB error'));

      await FcmTokenController.register(req, res);

      expect(res.status).toHaveBeenCalledWith(500);
      expect(res.json).toHaveBeenCalledWith({ message: 'Failed to register token' });
    });
  });

  describe('remove()', () => {
    it('should return 400 if fcm_token is missing', async () => {
      const req = mockReq({ body: {} });
      const res = mockRes();

      await FcmTokenController.remove(req, res);

      expect(res.status).toHaveBeenCalledWith(400);
      expect(res.json).toHaveBeenCalledWith({ message: 'fcm_token is required' });
    });

    it('should return 404 if token was not found', async () => {
      const req = mockReq({ body: { fcm_token: 'tok123' } });
      const res = mockRes();
      FcmToken.delete.mockResolvedValue(null);

      await FcmTokenController.remove(req, res);

      expect(res.status).toHaveBeenCalledWith(404);
      expect(res.json).toHaveBeenCalledWith({ message: 'Token not found' });
    });

    it('should return 200 on successful token removal', async () => {
      const req = mockReq({ body: { fcm_token: 'tok123' } });
      const res = mockRes();
      FcmToken.delete.mockResolvedValue({ id: 1 });

      await FcmTokenController.remove(req, res);

      expect(FcmToken.delete).toHaveBeenCalledWith('user-uuid', 'tok123');
      expect(res.status).toHaveBeenCalledWith(200);
      expect(res.json).toHaveBeenCalledWith({ message: 'Token removed' });
    });

    it('should return 500 on remove exception', async () => {
      const req = mockReq({ body: { fcm_token: 'tok123' } });
      const res = mockRes();
      FcmToken.delete.mockRejectedValue(new Error('DB error'));

      await FcmTokenController.remove(req, res);

      expect(res.status).toHaveBeenCalledWith(500);
      expect(res.json).toHaveBeenCalledWith({ message: 'Failed to remove token' });
    });
  });

  describe('list()', () => {
    it('should return active tokens for user', async () => {
      const req = mockReq();
      const res = mockRes();
      const mockTokens = [{ fcm_token: 'tok1' }];
      FcmToken.getActiveByUser.mockResolvedValue(mockTokens);

      await FcmTokenController.list(req, res);

      expect(FcmToken.getActiveByUser).toHaveBeenCalledWith('user-uuid');
      expect(res.status).toHaveBeenCalledWith(200);
      expect(res.json).toHaveBeenCalledWith({ tokens: mockTokens });
    });

    it('should return 500 on list exception', async () => {
      const req = mockReq();
      const res = mockRes();
      FcmToken.getActiveByUser.mockRejectedValue(new Error('DB error'));

      await FcmTokenController.list(req, res);

      expect(res.status).toHaveBeenCalledWith(500);
      expect(res.json).toHaveBeenCalledWith({ message: 'Failed to fetch tokens' });
    });
  });
});

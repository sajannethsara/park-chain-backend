// __tests__/services/FirebaseService.test.js
const { mockQuery } = require('../mocks/db.mock');

const mockSend = jest.fn();
const mockSendEachForMulticast = jest.fn();

jest.mock('firebase-admin', () => ({
  apps: ['app'],
  initializeApp: jest.fn(),
  credential: {
    cert: jest.fn(),
  },
  messaging: () => ({
    send: mockSend,
    sendEachForMulticast: mockSendEachForMulticast,
  }),
}));

const { sendNotification, sendMulticast } = require('../../src/services/FirebaseService');

describe('FirebaseService', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  describe('sendNotification()', () => {
    it('should return null if no token provided', async () => {
      const result = await sendNotification(null, 'Title', 'Body');
      expect(result).toBeNull();
    });

    it('should send notification and update last_used_at on success', async () => {
      mockSend.mockResolvedValueOnce('msg_123');
      mockQuery.mockResolvedValueOnce({ rows: [] });

      const result = await sendNotification('fcm_token_1', 'Title', 'Body', { key: 'val' });

      expect(result).toBe('msg_123');
      expect(mockSend).toHaveBeenCalledWith(
        expect.objectContaining({
          token: 'fcm_token_1',
          notification: { title: 'Title', body: 'Body' },
          data: { key: 'val' },
        })
      );
      expect(mockQuery).toHaveBeenCalledWith(
        expect.stringContaining('UPDATE user_fcm_tokens SET last_used_at = NOW()'),
        ['fcm_token_1']
      );
    });

    it('should deactivate stale token if unregistered/invalid error occurs', async () => {
      const err = new Error('Not registered');
      err.code = 'messaging/registration-token-not-registered';
      mockSend.mockRejectedValueOnce(err);
      mockQuery.mockResolvedValueOnce({ rows: [] });

      const result = await sendNotification('fcm_stale_token_1234567890', 'Title', 'Body');

      expect(result).toBeNull();
      expect(mockQuery).toHaveBeenCalledWith(
        expect.stringContaining('UPDATE user_fcm_tokens SET is_active = FALSE WHERE fcm_token = $1'),
        ['fcm_stale_token_1234567890']
      );
    });

    it('should handle general error without deactivating token', async () => {
      const err = new Error('Network timeout');
      mockSend.mockRejectedValueOnce(err);

      const result = await sendNotification('fcm_token_1', 'Title', 'Body');

      expect(result).toBeNull();
      expect(mockQuery).not.toHaveBeenCalled();
    });
  });

  describe('sendMulticast()', () => {
    it('should return null if fcmTokens array is empty or undefined', async () => {
      const result = await sendMulticast([], 'Title', 'Body');
      expect(result).toBeNull();
    });

    it('should send multicast message and return response on success', async () => {
      const mockResp = {
        successCount: 2,
        failureCount: 0,
        responses: [{ success: true }, { success: true }],
      };
      mockSendEachForMulticast.mockResolvedValueOnce(mockResp);

      const result = await sendMulticast(['t1', 't2'], 'Title', 'Body', { num: 123 });

      expect(result).toEqual(mockResp);
      expect(mockSendEachForMulticast).toHaveBeenCalledWith(
        expect.objectContaining({
          tokens: ['t1', 't2'],
          data: { num: '123' },
        })
      );
    });

    it('should deactivate stale tokens found in failure responses', async () => {
      const mockResp = {
        successCount: 1,
        failureCount: 1,
        responses: [
          { success: true },
          { success: false, error: { code: 'messaging/invalid-registration-token' } },
        ],
      };
      mockSendEachForMulticast.mockResolvedValueOnce(mockResp);
      mockQuery.mockResolvedValueOnce({ rows: [] });

      const result = await sendMulticast(['t1', 't2'], 'Title', 'Body');

      expect(result).toEqual(mockResp);
      expect(mockQuery).toHaveBeenCalledWith(
        expect.stringContaining('WHERE fcm_token = ANY($1)'),
        [['t2']]
      );
    });

    it('should handle multicast error and return null', async () => {
      mockSendEachForMulticast.mockRejectedValueOnce(new Error('Firebase error'));

      const result = await sendMulticast(['t1'], 'Title', 'Body');

      expect(result).toBeNull();
    });
  });
});

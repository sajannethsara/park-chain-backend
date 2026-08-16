// __tests__/models/FcmToken.test.js
const { mockQuery } = require('../mocks/db.mock');
const FcmToken = require('../../src/models/FcmToken');

describe('FcmToken Model', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  describe('upsert()', () => {
    it('should upsert an FCM token with defaults', async () => {
      const mockRow = { id: 1, user_id: 'u1', fcm_token: 'token123', is_active: true };
      mockQuery.mockResolvedValueOnce({ rows: [mockRow] });

      const result = await FcmToken.upsert('u1', 'token123');

      expect(result).toEqual(mockRow);
      expect(mockQuery).toHaveBeenCalledWith(
        expect.stringContaining('INSERT INTO user_fcm_tokens'),
        ['u1', 'token123', null, null]
      );
    });

    it('should upsert with deviceType and deviceLabel', async () => {
      const mockRow = { id: 2, user_id: 'u1', fcm_token: 'token456', device_type: 'android', device_label: 'Pixel 8' };
      mockQuery.mockResolvedValueOnce({ rows: [mockRow] });

      const result = await FcmToken.upsert('u1', 'token456', 'android', 'Pixel 8');

      expect(result).toEqual(mockRow);
      expect(mockQuery).toHaveBeenCalledWith(
        expect.stringContaining('INSERT INTO user_fcm_tokens'),
        ['u1', 'token456', 'android', 'Pixel 8']
      );
    });
  });

  describe('getActiveByUser()', () => {
    it('should return active tokens for a user', async () => {
      const mockRows = [{ fcm_token: 'token1' }, { fcm_token: 'token2' }];
      mockQuery.mockResolvedValueOnce({ rows: mockRows });

      const result = await FcmToken.getActiveByUser('u1');

      expect(result).toEqual(mockRows);
      expect(mockQuery).toHaveBeenCalledWith(
        expect.stringContaining('WHERE user_id = $1 AND is_active = TRUE'),
        ['u1']
      );
    });
  });

  describe('deactivate()', () => {
    it('should deactivate a token', async () => {
      const mockRow = { fcm_token: 'token1', is_active: false };
      mockQuery.mockResolvedValueOnce({ rows: [mockRow] });

      const result = await FcmToken.deactivate('token1');

      expect(result).toEqual(mockRow);
      expect(mockQuery).toHaveBeenCalledWith(
        expect.stringContaining('SET is_active = FALSE'),
        ['token1']
      );
    });
  });

  describe('deactivateAllForUser()', () => {
    it('should deactivate all tokens for a user', async () => {
      mockQuery.mockResolvedValueOnce({ rows: [] });

      await FcmToken.deactivateAllForUser('u1');

      expect(mockQuery).toHaveBeenCalledWith(
        expect.stringContaining('UPDATE user_fcm_tokens SET is_active = FALSE WHERE user_id = $1'),
        ['u1']
      );
    });
  });

  describe('delete()', () => {
    it('should delete a specific token for a user', async () => {
      const mockRow = { id: 1, user_id: 'u1', fcm_token: 'token1' };
      mockQuery.mockResolvedValueOnce({ rows: [mockRow] });

      const result = await FcmToken.delete('u1', 'token1');

      expect(result).toEqual(mockRow);
      expect(mockQuery).toHaveBeenCalledWith(
        expect.stringContaining('DELETE FROM user_fcm_tokens'),
        ['u1', 'token1']
      );
    });
  });
});

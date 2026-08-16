// __tests__/controllers/NotificationController.test.js
const { mockQuery } = require('../mocks/db.mock');
const NotificationController = require('../../src/controllers/NotificationController');

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

describe('NotificationController', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  describe('getNotifications()', () => {
    it('should retrieve notifications with defaults', async () => {
      const req = mockReq({ query: {} });
      const res = mockRes();
      const mockRows = [{ id: 1, title: 'Test Notif' }];

      mockQuery
        .mockResolvedValueOnce({ rows: mockRows }) // select query
        .mockResolvedValueOnce({ rows: [{ count: '1' }] }); // count query

      await NotificationController.getNotifications(req, res);

      expect(res.status).toHaveBeenCalledWith(200);
      expect(res.json).toHaveBeenCalledWith(
        expect.objectContaining({
          message: 'Notifications retrieved successfully',
          data: mockRows,
          pagination: { total: 1, limit: 20, offset: 0, hasMore: false },
        })
      );
    });

    it('should filter by read status', async () => {
      const req = mockReq({ query: { read: 'true', limit: '10', offset: '5' } });
      const res = mockRes();

      mockQuery
        .mockResolvedValueOnce({ rows: [] })
        .mockResolvedValueOnce({ rows: [{ count: '0' }] });

      await NotificationController.getNotifications(req, res);

      expect(res.status).toHaveBeenCalledWith(200);
      expect(mockQuery).toHaveBeenCalledWith(
        expect.stringContaining('AND is_read = $2'),
        ['user-uuid', true, 10, 5]
      );
    });

    it('should return 500 when query fails', async () => {
      const req = mockReq();
      const res = mockRes();

      mockQuery.mockRejectedValueOnce(new Error('DB failure'));

      await NotificationController.getNotifications(req, res);

      expect(res.status).toHaveBeenCalledWith(500);
      expect(res.json).toHaveBeenCalledWith({ message: 'Failed to fetch notifications' });
    });
  });

  describe('getUnreadCount()', () => {
    it('should retrieve unread notification count', async () => {
      const req = mockReq();
      const res = mockRes();

      mockQuery.mockResolvedValueOnce({ rows: [{ unread_count: '5' }] });

      await NotificationController.getUnreadCount(req, res);

      expect(res.status).toHaveBeenCalledWith(200);
      expect(res.json).toHaveBeenCalledWith({
        message: 'Unread count retrieved successfully',
        unreadCount: 5,
      });
    });

    it('should return 500 on getUnreadCount error', async () => {
      const req = mockReq();
      const res = mockRes();

      mockQuery.mockRejectedValueOnce(new Error('DB failure'));

      await NotificationController.getUnreadCount(req, res);

      expect(res.status).toHaveBeenCalledWith(500);
      expect(res.json).toHaveBeenCalledWith({ message: 'Failed to fetch unread count' });
    });
  });

  describe('markAsRead()', () => {
    it('should return 404 if notification not found or belongs to another user', async () => {
      const req = mockReq({ params: { id: '99' } });
      const res = mockRes();

      mockQuery.mockResolvedValueOnce({ rows: [] });

      await NotificationController.markAsRead(req, res);

      expect(res.status).toHaveBeenCalledWith(404);
      expect(res.json).toHaveBeenCalledWith({ message: 'Notification not found' });
    });

    it('should mark notification as read successfully', async () => {
      const req = mockReq({ params: { id: '1' } });
      const res = mockRes();

      mockQuery
        .mockResolvedValueOnce({ rows: [{ id: 1 }] })
        .mockResolvedValueOnce({ rows: [] });

      await NotificationController.markAsRead(req, res);

      expect(res.status).toHaveBeenCalledWith(200);
      expect(res.json).toHaveBeenCalledWith({ message: 'Notification marked as read' });
    });

    it('should return 500 on error', async () => {
      const req = mockReq({ params: { id: '1' } });
      const res = mockRes();

      mockQuery.mockRejectedValueOnce(new Error('DB failure'));

      await NotificationController.markAsRead(req, res);

      expect(res.status).toHaveBeenCalledWith(500);
      expect(res.json).toHaveBeenCalledWith({ message: 'Failed to mark notification as read' });
    });
  });

  describe('markAllAsRead()', () => {
    it('should mark all notifications as read', async () => {
      const req = mockReq();
      const res = mockRes();

      mockQuery.mockResolvedValueOnce({ rowCount: 4 });

      await NotificationController.markAllAsRead(req, res);

      expect(res.status).toHaveBeenCalledWith(200);
      expect(res.json).toHaveBeenCalledWith({
        message: 'All notifications marked as read',
        updated: 4,
      });
    });

    it('should return 500 on error', async () => {
      const req = mockReq();
      const res = mockRes();

      mockQuery.mockRejectedValueOnce(new Error('DB error'));

      await NotificationController.markAllAsRead(req, res);

      expect(res.status).toHaveBeenCalledWith(500);
      expect(res.json).toHaveBeenCalledWith({ message: 'Failed to mark all notifications as read' });
    });
  });

  describe('deleteNotification()', () => {
    it('should return 404 if notification to delete was not found', async () => {
      const req = mockReq({ params: { id: '99' } });
      const res = mockRes();

      mockQuery.mockResolvedValueOnce({ rowCount: 0 });

      await NotificationController.deleteNotification(req, res);

      expect(res.status).toHaveBeenCalledWith(404);
      expect(res.json).toHaveBeenCalledWith({ message: 'Notification not found' });
    });

    it('should delete notification successfully', async () => {
      const req = mockReq({ params: { id: '1' } });
      const res = mockRes();

      mockQuery.mockResolvedValueOnce({ rowCount: 1 });

      await NotificationController.deleteNotification(req, res);

      expect(res.status).toHaveBeenCalledWith(200);
      expect(res.json).toHaveBeenCalledWith({ message: 'Notification deleted successfully' });
    });

    it('should return 500 on delete error', async () => {
      const req = mockReq({ params: { id: '1' } });
      const res = mockRes();

      mockQuery.mockRejectedValueOnce(new Error('DB error'));

      await NotificationController.deleteNotification(req, res);

      expect(res.status).toHaveBeenCalledWith(500);
      expect(res.json).toHaveBeenCalledWith({ message: 'Failed to delete notification' });
    });
  });

  describe('deleteAllNotifications()', () => {
    it('should delete all notifications for user', async () => {
      const req = mockReq();
      const res = mockRes();

      mockQuery.mockResolvedValueOnce({ rowCount: 7 });

      await NotificationController.deleteAllNotifications(req, res);

      expect(res.status).toHaveBeenCalledWith(200);
      expect(res.json).toHaveBeenCalledWith({
        message: 'All notifications deleted successfully',
        deleted: 7,
      });
    });

    it('should return 500 on deleteAll error', async () => {
      const req = mockReq();
      const res = mockRes();

      mockQuery.mockRejectedValueOnce(new Error('DB error'));

      await NotificationController.deleteAllNotifications(req, res);

      expect(res.status).toHaveBeenCalledWith(500);
      expect(res.json).toHaveBeenCalledWith({ message: 'Failed to delete notifications' });
    });
  });
});

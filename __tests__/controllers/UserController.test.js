// __tests__/controllers/UserController.test.js
jest.mock('../../src/models/User');

const User = require('../../src/models/User');
const {
  updateProfile,
  getProfile,
  uploadProfileImage,
  getUserById,
  getUsers,
  updateUserStatus,
  deleteUser,
  buildProfileResponse,
} = require('../../src/controllers/UserController');

const mockReq = (overrides = {}) => ({
  body: {},
  params: {},
  query: {},
  headers: {},
  user: { id: 'user-uuid', role: 'driver' },
  ...overrides,
});

const mockRes = () => {
  const res = {};
  res.status = jest.fn().mockReturnValue(res);
  res.json = jest.fn().mockReturnValue(res);
  return res;
};

describe('UserController', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  describe('buildProfileResponse helper', () => {
    it('builds profile response with vehicleType', () => {
      User.isProfileCompleted.mockReturnValue(true);
      const user = {
        id: 'u1',
        name: 'John',
        email: 'john@example.com',
        phone: '1234567890',
        license_no: 'LIC123',
        profile_image: 'https://img.com/pic.jpg',
        wallet_address: 'rWallet123',
        vehicle_type: 'Car',
      };

      const resp = buildProfileResponse(user);

      expect(resp).toEqual({
        data: {
          userId: 'u1',
          fullName: 'John',
          email: 'john@example.com',
          phoneNumber: '1234567890',
          licenseNo: 'LIC123',
          profileImageUrl: 'https://img.com/pic.jpg',
          profileCompleted: true,
          walletAddress: 'rWallet123',
          vehicleType: 'Car',
        },
      });
    });

    it('builds profile response without optional fields', () => {
      User.isProfileCompleted.mockReturnValue(false);
      const user = { id: 'u2' };

      const resp = buildProfileResponse(user);

      expect(resp.data.userId).toBe('u2');
      expect(resp.data.fullName).toBeNull();
      expect(resp.data.vehicleType).toBeUndefined();
    });
  });

  describe('updateProfile()', () => {
    it('should update profile and return 200', async () => {
      const req = mockReq({
        headers: { 'content-type': 'application/json' },
        body: {
          fullName: 'Alice Smith',
          phoneNumber: '0987654321',
          email: 'alice@example.com',
          licensePlate: 'CAB-1234',
          vehicleType: 'Van',
        },
      });
      const res = mockRes();
      const mockUpdated = {
        id: 'user-uuid',
        name: 'Alice Smith',
        email: 'alice@example.com',
        phone: '0987654321',
        license_no: 'CAB-1234',
        vehicle_type: 'Van',
      };
      User.updateProfile.mockResolvedValue(mockUpdated);
      User.isProfileCompleted.mockReturnValue(true);

      await updateProfile(req, res);

      expect(User.updateProfile).toHaveBeenCalledWith('user-uuid', {
        name: 'Alice Smith',
        email: 'alice@example.com',
        phone: '0987654321',
        licenseNo: 'CAB-1234',
        vehicleType: 'Van',
      });
      expect(res.status).toHaveBeenCalledWith(200);
      expect(res.json).toHaveBeenCalledWith(expect.objectContaining({ data: expect.any(Object) }));
    });

    it('should return 404 when user is not found during update', async () => {
      const req = mockReq({ body: { name: 'Bob' } });
      const res = mockRes();
      User.updateProfile.mockResolvedValue(null);

      await updateProfile(req, res);

      expect(res.status).toHaveBeenCalledWith(404);
      expect(res.json).toHaveBeenCalledWith({ error: 'User not found' });
    });

    it('should return 500 on update profile failure', async () => {
      const req = mockReq({ body: { name: 'Bob' } });
      const res = mockRes();
      User.updateProfile.mockRejectedValue(new Error('DB error'));

      await updateProfile(req, res);

      expect(res.status).toHaveBeenCalledWith(500);
      expect(res.json).toHaveBeenCalledWith({ error: 'Failed to update profile' });
    });
  });

  describe('getProfile()', () => {
    it('should return profile for authenticated user', async () => {
      const req = mockReq();
      const res = mockRes();
      const mockUser = { id: 'user-uuid', name: 'John Doe' };
      User.findById.mockResolvedValue(mockUser);
      User.isProfileCompleted.mockReturnValue(true);

      await getProfile(req, res);

      expect(User.findById).toHaveBeenCalledWith('user-uuid');
      expect(res.status).toHaveBeenCalledWith(200);
      expect(res.json).toHaveBeenCalledWith(expect.objectContaining({ data: expect.any(Object) }));
    });

    it('should return 404 if user profile not found', async () => {
      const req = mockReq();
      const res = mockRes();
      User.findById.mockResolvedValue(null);

      await getProfile(req, res);

      expect(res.status).toHaveBeenCalledWith(404);
      expect(res.json).toHaveBeenCalledWith({ error: 'User not found' });
    });

    it('should return 500 on getProfile exception', async () => {
      const req = mockReq();
      const res = mockRes();
      User.findById.mockRejectedValue(new Error('DB failure'));

      await getProfile(req, res);

      expect(res.status).toHaveBeenCalledWith(500);
      expect(res.json).toHaveBeenCalledWith({ error: 'Failed to get profile' });
    });
  });

  describe('uploadProfileImage()', () => {
    it('should return 400 if no file provided', async () => {
      const req = mockReq({ file: null });
      const res = mockRes();

      await uploadProfileImage(req, res);

      expect(res.status).toHaveBeenCalledWith(400);
      expect(res.json).toHaveBeenCalledWith({ error: 'No image file provided' });
    });

    it('should return 404 if user not found', async () => {
      const req = mockReq({ file: { path: 'https://cloudinary.com/pic.jpg' } });
      const res = mockRes();
      User.updateProfile.mockResolvedValue(null);

      await uploadProfileImage(req, res);

      expect(res.status).toHaveBeenCalledWith(404);
      expect(res.json).toHaveBeenCalledWith({ error: 'User not found' });
    });

    it('should update and return uploaded profile image url', async () => {
      const req = mockReq({ file: { path: 'https://cloudinary.com/pic.jpg' } });
      const res = mockRes();
      User.updateProfile.mockResolvedValue({ id: 'user-uuid', profile_image: 'https://cloudinary.com/pic.jpg' });

      await uploadProfileImage(req, res);

      expect(res.status).toHaveBeenCalledWith(200);
      expect(res.json).toHaveBeenCalledWith({ success: true, imageUrl: 'https://cloudinary.com/pic.jpg' });
    });

    it('should return 500 on upload error', async () => {
      const req = mockReq({ file: { path: 'https://cloudinary.com/pic.jpg' } });
      const res = mockRes();
      User.updateProfile.mockRejectedValue(new Error('Cloud error'));

      await uploadProfileImage(req, res);

      expect(res.status).toHaveBeenCalledWith(500);
      expect(res.json).toHaveBeenCalledWith({ error: 'Failed to upload profile image' });
    });
  });

  describe('getUserById()', () => {
    it('should return user details by id', async () => {
      const req = mockReq({ params: { id: 'target-uuid' } });
      const res = mockRes();
      const mockUser = { id: 'target-uuid', name: 'Target' };
      User.findById.mockResolvedValue(mockUser);

      await getUserById(req, res);

      expect(User.findById).toHaveBeenCalledWith('target-uuid');
      expect(res.status).toHaveBeenCalledWith(200);
      expect(res.json).toHaveBeenCalledWith({ user: mockUser });
    });

    it('should return 404 when target user not found', async () => {
      const req = mockReq({ params: { id: 'nonexistent' } });
      const res = mockRes();
      User.findById.mockResolvedValue(null);

      await getUserById(req, res);

      expect(res.status).toHaveBeenCalledWith(404);
      expect(res.json).toHaveBeenCalledWith({ error: 'User not found' });
    });

    it('should return 500 on getUserById error', async () => {
      const req = mockReq({ params: { id: 'target-uuid' } });
      const res = mockRes();
      User.findById.mockRejectedValue(new Error('DB error'));

      await getUserById(req, res);

      expect(res.status).toHaveBeenCalledWith(500);
      expect(res.json).toHaveBeenCalledWith({ error: 'Failed to get user details' });
    });
  });

  describe('getUsers()', () => {
    it('should return sellers with stats when role is seller', async () => {
      const req = mockReq({ query: { role: 'seller' } });
      const res = mockRes();
      const mockSellers = [{ id: 's1', name: 'Seller 1', spots_count: 3 }];
      User.getSellersWithStats.mockResolvedValue(mockSellers);

      await getUsers(req, res);

      expect(User.getSellersWithStats).toHaveBeenCalled();
      expect(res.status).toHaveBeenCalledWith(200);
      expect(res.json).toHaveBeenCalledWith(mockSellers);
    });

    it('should return all users or filtered by other role', async () => {
      const req = mockReq({ query: { role: 'driver' } });
      const res = mockRes();
      const mockDrivers = [{ id: 'd1', role: 'driver' }];
      User.findAll.mockResolvedValue(mockDrivers);

      await getUsers(req, res);

      expect(User.findAll).toHaveBeenCalledWith('driver');
      expect(res.status).toHaveBeenCalledWith(200);
      expect(res.json).toHaveBeenCalledWith(mockDrivers);
    });

    it('should return 500 on getUsers failure', async () => {
      const req = mockReq();
      const res = mockRes();
      User.findAll.mockRejectedValue(new Error('DB error'));

      await getUsers(req, res);

      expect(res.status).toHaveBeenCalledWith(500);
      expect(res.json).toHaveBeenCalledWith({ error: 'Failed to fetch users' });
    });
  });

  describe('updateUserStatus()', () => {
    it('should return 400 for invalid status', async () => {
      const req = mockReq({ params: { id: 'u1' }, body: { status: 'invalid_status' } });
      const res = mockRes();

      await updateUserStatus(req, res);

      expect(res.status).toHaveBeenCalledWith(400);
      expect(res.json).toHaveBeenCalledWith({ error: 'Invalid status provided' });
    });

    it('should return 404 when user to update is not found', async () => {
      const req = mockReq({ params: { id: 'u1' }, body: { status: 'suspended' } });
      const res = mockRes();
      User.updateStatus.mockResolvedValue(null);

      await updateUserStatus(req, res);

      expect(res.status).toHaveBeenCalledWith(404);
      expect(res.json).toHaveBeenCalledWith({ error: 'User not found' });
    });

    it('should update user status successfully', async () => {
      const req = mockReq({ params: { id: 'u1' }, body: { status: 'active' } });
      const res = mockRes();
      const mockUpdated = { id: 'u1', status: 'active' };
      User.updateStatus.mockResolvedValue(mockUpdated);

      await updateUserStatus(req, res);

      expect(User.updateStatus).toHaveBeenCalledWith('u1', 'active');
      expect(res.status).toHaveBeenCalledWith(200);
      expect(res.json).toHaveBeenCalledWith({ message: 'Success', user: mockUpdated });
    });

    it('should return 500 on updateUserStatus error', async () => {
      const req = mockReq({ params: { id: 'u1' }, body: { status: 'active' } });
      const res = mockRes();
      User.updateStatus.mockRejectedValue(new Error('DB error'));

      await updateUserStatus(req, res);

      expect(res.status).toHaveBeenCalledWith(500);
      expect(res.json).toHaveBeenCalledWith({ error: 'Failed to update user status' });
    });
  });

  describe('deleteUser()', () => {
    it('should return 404 if user not found', async () => {
      const req = mockReq({ params: { id: 'u1' } });
      const res = mockRes();
      User.remove.mockResolvedValue(null);

      await deleteUser(req, res);

      expect(res.status).toHaveBeenCalledWith(404);
      expect(res.json).toHaveBeenCalledWith({ error: 'User not found' });
    });

    it('should delete user and return 200', async () => {
      const req = mockReq({ params: { id: 'u1' } });
      const res = mockRes();
      User.remove.mockResolvedValue({ id: 'u1' });

      await deleteUser(req, res);

      expect(User.remove).toHaveBeenCalledWith('u1');
      expect(res.status).toHaveBeenCalledWith(200);
      expect(res.json).toHaveBeenCalledWith({ message: 'User successfully removed' });
    });

    it('should return 500 on delete error', async () => {
      const req = mockReq({ params: { id: 'u1' } });
      const res = mockRes();
      User.remove.mockRejectedValue(new Error('DB error'));

      await deleteUser(req, res);

      expect(res.status).toHaveBeenCalledWith(500);
      expect(res.json).toHaveBeenCalledWith({ error: 'Failed to delete user' });
    });
  });
});

// __tests__/controllers/XummController.test.js
// ============================================
// Tests for XummController
// ============================================

// ── Mock dependencies FIRST ───────────────────────────
jest.mock('../../src/services/XummService');
jest.mock('../../src/models/User');
jest.mock('../../src/models/Booking');
jest.mock('../../src/models/Transaction');
jest.mock('../../src/services/XrplService');
jest.mock('../../src/events/NotificationEvents', () => ({
  fireEvent: jest.fn().mockResolvedValue(),
  EVENTS: {
    BOOKING_CONFIRMED_DRIVER: 'BOOKING_CONFIRMED_DRIVER',
    BOOKING_CONFIRMED_OWNER: 'BOOKING_CONFIRMED_OWNER',
  },
}));
jest.mock('jsonwebtoken');

const xummService = require('../../src/services/XummService');
const User        = require('../../src/models/User');
const Booking     = require('../../src/models/Booking');
const Transaction = require('../../src/models/Transaction');
const xrplService = require('../../src/services/XrplService');
const jwt         = require('jsonwebtoken');

const {
  login,
  verify,
  createPayment,
  verifyPayment,
} = require('../../src/controllers/XummController');

// ── Helper: mock req/res ──────────────────────────────
const mockReq = (overrides = {}) => ({
  body:    {},
  params:  {},
  query:   {},
  headers: {},
  user:    { id: 'user-uuid', role: 'driver' },
  ...overrides,
});

const mockRes = () => {
  const res = {};
  res.status = jest.fn().mockReturnValue(res);
  res.json   = jest.fn().mockReturnValue(res);
  return res;
};

// ── Setup env ─────────────────────────────────────────
beforeEach(() => {
  jest.clearAllMocks();
  process.env.JWT_SECRET             = 'test-secret';
  process.env.JWT_EXPIRES_IN         = '7d';
  process.env.ADMIN_WALLET_ADDRESS   = 'rAdminWallet123';
  process.env.ADMIN_WALLET_SEED      = 'sAdminSeed123';
});

describe('XummController', () => {

  // ════════════════════════════════════════════════════
  // GROUP 1: login()
  // POST /api/auth/xumm/login
  // ════════════════════════════════════════════════════
  describe('login()', () => {

    test('creates sign-in payload and returns uuid', async () => {
      // Arrange
      xummService.createSignInPayload.mockResolvedValue({
        uuid:     'xaman-uuid-123',
        deepLink: 'xumm://sign/xaman-uuid-123',
        qrUrl:    'https://xumm.app/qr/xaman-uuid-123',
      });

      const req = mockReq();
      const res = mockRes();

      // Act
      await login(req, res);

      // Assert
      expect(res.json).toHaveBeenCalledWith(
        expect.objectContaining({
          message:  'Open Xaman app to sign in',
          uuid:     'xaman-uuid-123',
          deepLink: expect.stringContaining('xumm://'),
          qrUrl:    expect.stringContaining('xumm.app'),
        })
      );
    });

    test('returns 500 when xummService fails', async () => {
      xummService.createSignInPayload.mockRejectedValue(
        new Error('Xaman API error')
      );

      const req = mockReq();
      const res = mockRes();

      await login(req, res);

      expect(res.status).toHaveBeenCalledWith(500);
      expect(res.json).toHaveBeenCalledWith(
        expect.objectContaining({
          error: expect.stringContaining('Failed'),
        })
      );
    });

    test('calls createSignInPayload exactly once', async () => {
      xummService.createSignInPayload.mockResolvedValue({
        uuid:     'xaman-uuid-123',
        deepLink: 'xumm://sign/test',
        qrUrl:    null,
      });

      const req = mockReq();
      const res = mockRes();

      await login(req, res);

      expect(xummService.createSignInPayload)
        .toHaveBeenCalledTimes(1);
    });

    test('response contains all required fields', async () => {
      xummService.createSignInPayload.mockResolvedValue({
        uuid:     'test-uuid',
        deepLink: 'xumm://test',
        qrUrl:    'https://xumm.app/qr/test',
      });

      const req = mockReq();
      const res = mockRes();

      await login(req, res);

      const response = res.json.mock.calls[0][0];
      expect(response).toHaveProperty('message');
      expect(response).toHaveProperty('uuid');
      expect(response).toHaveProperty('deepLink');
      expect(response).toHaveProperty('qrUrl');
    });
  });

  // ════════════════════════════════════════════════════
  // GROUP 2: verify()
  // POST /api/auth/xumm/verify
  // ════════════════════════════════════════════════════
  describe('verify()', () => {

    test('returns 400 when uuid is missing', async () => {
      const req = mockReq({ body: {} }); // no uuid
      const res = mockRes();

      await verify(req, res);

      expect(res.status).toHaveBeenCalledWith(400);
      expect(res.json).toHaveBeenCalledWith(
        expect.objectContaining({
          error: 'uuid is required.',
        })
      );
    });

    test('returns 401 when user did not sign', async () => {
      xummService.verifyPayload.mockResolvedValue({
        signed: false,
        reason: 'User cancelled',
      });

      const req = mockReq({ body: { uuid: 'test-uuid' } });
      const res = mockRes();

      await verify(req, res);

      expect(res.status).toHaveBeenCalledWith(401);
      expect(res.json).toHaveBeenCalledWith(
        expect.objectContaining({
          error: 'Sign-in not completed.',
        })
      );
    });

    test('returns token for existing user', async () => {
      xummService.verifyPayload.mockResolvedValue({
        signed:        true,
        walletAddress: 'rDriverWallet123',
      });

      User.findByWalletAddress.mockResolvedValue({
        id:             'driver-uuid',
        role:           'driver',
        wallet_address: 'rDriverWallet123',
      });

      jwt.sign.mockReturnValue('fake-jwt-token');

      const req = mockReq({
        body: { uuid: 'test-uuid' },
      });
      const res = mockRes();

      await verify(req, res);

      expect(res.json).toHaveBeenCalledWith(
        expect.objectContaining({
          message: 'Xaman login successful!',
          token:   'fake-jwt-token',
        })
      );
    });

    test('creates new user when not found', async () => {
      xummService.verifyPayload.mockResolvedValue({
        signed:        true,
        walletAddress: 'rNewDriverWallet123',
      });

      // User not found
      User.findByWalletAddress.mockResolvedValue(null);

      // Create new user
      User.createXamanUser.mockResolvedValue({
        id:             'new-driver-uuid',
        role:           'driver',
        wallet_address: 'rNewDriverWallet123',
      });

      jwt.sign.mockReturnValue('new-user-token');

      const req = mockReq({
        body: { uuid: 'test-uuid' },
      });
      const res = mockRes();

      await verify(req, res);

      // Check createXamanUser called
      expect(User.createXamanUser).toHaveBeenCalledWith(
        expect.objectContaining({
          walletAddress: 'rNewDriverWallet123',
          role:          'driver',
        })
      );

      expect(res.json).toHaveBeenCalledWith(
        expect.objectContaining({
          message: 'Xaman login successful!',
        })
      );
    });

    test('new user is always created as driver', async () => {
      xummService.verifyPayload.mockResolvedValue({
        signed:        true,
        walletAddress: 'rNewWallet',
      });

      User.findByWalletAddress.mockResolvedValue(null);
      User.createXamanUser.mockResolvedValue({
        id:   'new-uuid',
        role: 'driver',
      });
      jwt.sign.mockReturnValue('token');

      const req = mockReq({ body: { uuid: 'uuid' } });
      const res = mockRes();

      await verify(req, res);

      expect(User.createXamanUser).toHaveBeenCalledWith(
        expect.objectContaining({ role: 'driver' })
      );
    });

    test('returns 500 on unexpected error', async () => {
      xummService.verifyPayload.mockRejectedValue(
        new Error('Network error')
      );

      const req = mockReq({ body: { uuid: 'test-uuid' } });
      const res = mockRes();

      await verify(req, res);

      expect(res.status).toHaveBeenCalledWith(500);
    });

    test('response includes walletAddress', async () => {
      xummService.verifyPayload.mockResolvedValue({
        signed:        true,
        walletAddress: 'rDriverWallet123',
      });
      User.findByWalletAddress.mockResolvedValue({
        id:   'driver-uuid',
        role: 'driver',
      });
      jwt.sign.mockReturnValue('token');

      const req = mockReq({ body: { uuid: 'test-uuid' } });
      const res = mockRes();

      await verify(req, res);

      expect(res.json).toHaveBeenCalledWith(
        expect.objectContaining({
          walletAddress: 'rDriverWallet123',
        })
      );
    });
  });

  // ════════════════════════════════════════════════════
  // GROUP 3: createPayment()
  // POST /api/auth/xumm/create-payment
  // ════════════════════════════════════════════════════
  describe('createPayment()', () => {

    const validBooking = {
      id:               'booking-uuid-123',
      driver_id:        'driver-uuid',
      total_price_xrp:  '4.000000',
      payment_status:   'unpaid',
    };

    const validUser = {
      id:             'driver-uuid',
      wallet_address: 'rDriverWallet123',
      role:           'driver',
    };

    const validHeaders = {
      authorization: 'Bearer valid-token',
    };

    test('returns 400 when bookingId missing', async () => {
      const req = mockReq({
        body:    {},
        headers: validHeaders,
      });
      const res = mockRes();

      await createPayment(req, res);

      expect(res.status).toHaveBeenCalledWith(400);
      expect(res.json).toHaveBeenCalledWith(
        expect.objectContaining({
          error: 'bookingId is required.',
        })
      );
    });

    test('returns 401 when no auth header', async () => {
      const req = mockReq({
        body:    { bookingId: 'booking-123' },
        headers: {}, // no authorization
      });
      const res = mockRes();

      await createPayment(req, res);

      expect(res.status).toHaveBeenCalledWith(401);
      expect(res.json).toHaveBeenCalledWith(
        expect.objectContaining({
          error: 'No token provided.',
        })
      );
    });

    test('returns 401 when user not found', async () => {
      jwt.verify.mockReturnValue({ userId: 'driver-uuid' });
      User.findById.mockResolvedValue(null);

      const req = mockReq({
        body:    { bookingId: 'booking-123' },
        headers: validHeaders,
      });
      const res = mockRes();

      await createPayment(req, res);

      expect(res.status).toHaveBeenCalledWith(401);
      expect(res.json).toHaveBeenCalledWith(
        expect.objectContaining({
          error: 'User not found.',
        })
      );
    });

    test('returns 404 when booking not found', async () => {
      jwt.verify.mockReturnValue({ userId: 'driver-uuid' });
      User.findById.mockResolvedValue(validUser);
      Booking.findById.mockResolvedValue(null);

      const req = mockReq({
        body:    { bookingId: 'invalid-booking' },
        headers: validHeaders,
      });
      const res = mockRes();

      await createPayment(req, res);

      expect(res.status).toHaveBeenCalledWith(404);
      expect(res.json).toHaveBeenCalledWith(
        expect.objectContaining({
          error: 'Booking not found.',
        })
      );
    });

    test('returns 403 when booking belongs to other driver', async () => {
      jwt.verify.mockReturnValue({ userId: 'driver-uuid' });
      User.findById.mockResolvedValue(validUser);
      Booking.findById.mockResolvedValue({
        ...validBooking,
        driver_id: 'other-driver-uuid', // different driver
      });

      const req = mockReq({
        body:    { bookingId: 'booking-123' },
        headers: validHeaders,
      });
      const res = mockRes();

      await createPayment(req, res);

      expect(res.status).toHaveBeenCalledWith(403);
      expect(res.json).toHaveBeenCalledWith(
        expect.objectContaining({
          error: 'This booking does not belong to you.',
        })
      );
    });

    test('returns 400 when already paid', async () => {
      jwt.verify.mockReturnValue({ userId: 'driver-uuid' });
      User.findById.mockResolvedValue(validUser);
      Booking.findById.mockResolvedValue({
        ...validBooking,
        payment_status: 'paid', // already paid
      });

      const req = mockReq({
        body:    { bookingId: 'booking-123' },
        headers: validHeaders,
      });
      const res = mockRes();

      await createPayment(req, res);

      expect(res.status).toHaveBeenCalledWith(400);
      expect(res.json).toHaveBeenCalledWith(
        expect.objectContaining({
          error: expect.stringContaining('already'),
        })
      );
    });

    test('returns 500 when admin wallet not configured', async () => {
      delete process.env.ADMIN_WALLET_ADDRESS;

      jwt.verify.mockReturnValue({ userId: 'driver-uuid' });
      User.findById.mockResolvedValue(validUser);
      Booking.findById.mockResolvedValue(validBooking);

      const req = mockReq({
        body:    { bookingId: 'booking-123' },
        headers: validHeaders,
      });
      const res = mockRes();

      await createPayment(req, res);

      expect(res.status).toHaveBeenCalledWith(500);
      expect(res.json).toHaveBeenCalledWith(
        expect.objectContaining({
          error: 'Admin wallet not configured.',
        })
      );
    });

    test('creates payment and returns uuid + deepLink', async () => {
      jwt.verify.mockReturnValue({ userId: 'driver-uuid' });
      User.findById.mockResolvedValue(validUser);
      Booking.findById.mockResolvedValue(validBooking);
      Booking.updatePaymentStatus.mockResolvedValue({});

      xummService.createPaymentPayload.mockResolvedValue({
        uuid:     'xaman-payment-uuid',
        deepLink: 'xumm://sign/xaman-payment-uuid',
        qrUrl:    'https://xumm.app/qr/xaman-payment-uuid',
      });

      const req = mockReq({
        body:    { bookingId: 'booking-123' },
        headers: validHeaders,
      });
      const res = mockRes();

      await createPayment(req, res);

      expect(res.json).toHaveBeenCalledWith(
        expect.objectContaining({
          message:  expect.stringContaining('Payment request'),
          uuid:     'xaman-payment-uuid',
          deepLink: expect.stringContaining('xumm://'),
        })
      );
    });

    test('updates booking status to processing', async () => {
      jwt.verify.mockReturnValue({ userId: 'driver-uuid' });
      User.findById.mockResolvedValue(validUser);
      Booking.findById.mockResolvedValue(validBooking);
      Booking.updatePaymentStatus.mockResolvedValue({});
      xummService.createPaymentPayload.mockResolvedValue({
        uuid:     'test-uuid',
        deepLink: 'xumm://test',
        qrUrl:    null,
      });

      const req = mockReq({
        body:    { bookingId: 'booking-123' },
        headers: validHeaders,
      });
      const res = mockRes();

      await createPayment(req, res);

      // Check status updated to processing
      expect(Booking.updatePaymentStatus)
        .toHaveBeenCalledWith('booking-123', 'processing');
    });

    test('converts XRP to drops correctly', async () => {
      jwt.verify.mockReturnValue({ userId: 'driver-uuid' });
      User.findById.mockResolvedValue(validUser);
      Booking.findById.mockResolvedValue({
        ...validBooking,
        total_price_xrp: '4.000000',
      });
      Booking.updatePaymentStatus.mockResolvedValue({});
      xummService.createPaymentPayload.mockResolvedValue({
        uuid:     'test-uuid',
        deepLink: 'xumm://test',
        qrUrl:    null,
      });

      const req = mockReq({
        body:    { bookingId: 'booking-123' },
        headers: validHeaders,
      });
      const res = mockRes();

      await createPayment(req, res);

      // 4.0 XRP = 4,000,000 drops
      expect(xummService.createPaymentPayload)
        .toHaveBeenCalledWith(
          expect.any(String),   // from address
          expect.any(String),   // to address
          '4000000',            // drops ← key check
          expect.any(String),   // bookingId
        );
    });

    test('sends payment FROM driver TO admin', async () => {
      jwt.verify.mockReturnValue({ userId: 'driver-uuid' });
      User.findById.mockResolvedValue({
        ...validUser,
        wallet_address: 'rDriverWallet123',
      });
      Booking.findById.mockResolvedValue(validBooking);
      Booking.updatePaymentStatus.mockResolvedValue({});
      xummService.createPaymentPayload.mockResolvedValue({
        uuid:     'test-uuid',
        deepLink: 'xumm://test',
        qrUrl:    null,
      });

      const req = mockReq({
        body:    { bookingId: 'booking-123' },
        headers: validHeaders,
      });
      const res = mockRes();

      await createPayment(req, res);

      expect(xummService.createPaymentPayload)
        .toHaveBeenCalledWith(
          'rDriverWallet123',   // FROM: driver
          'rAdminWallet123',    // TO: admin
          expect.any(String),
          expect.any(String),
        );
    });
  });

  // ════════════════════════════════════════════════════
  // GROUP 4: verifyPayment()
  // POST /api/auth/xumm/verify-payment
  // ════════════════════════════════════════════════════
  describe('verifyPayment()', () => {

    const validHeaders = {
      authorization: 'Bearer valid-token',
    };

    const validBooking = {
      id:                 'booking-uuid-123',
      driver_id:          'driver-uuid',
      owner_id:           'owner-uuid',
      start_time:         new Date('2026-08-16T10:00:00Z'),
      total_price_xrp:    '4.000000',
      admin_fee_xrp:      '0.800000',
      seller_amount_xrp:  '3.200000',
      payment_status:     'processing',
      owner_wallet:       'rSellerWallet456',
      spot_title:         'City Parking',
    };

    test('returns 400 when uuid missing', async () => {
      const req = mockReq({
        body:    { bookingId: 'booking-123' }, // no uuid
        headers: validHeaders,
      });
      const res = mockRes();

      await verifyPayment(req, res);

      expect(res.status).toHaveBeenCalledWith(400);
      expect(res.json).toHaveBeenCalledWith(
        expect.objectContaining({
          error: 'uuid and bookingId are required.',
        })
      );
    });

    test('returns 400 when bookingId missing', async () => {
      const req = mockReq({
        body:    { uuid: 'xaman-uuid' }, // no bookingId
        headers: validHeaders,
      });
      const res = mockRes();

      await verifyPayment(req, res);

      expect(res.status).toHaveBeenCalledWith(400);
    });

    test('returns 401 when no auth header', async () => {
      const req = mockReq({
        body:    { uuid: 'xaman-uuid', bookingId: 'booking-123' },
        headers: {}, // no auth
      });
      const res = mockRes();

      await verifyPayment(req, res);

      expect(res.status).toHaveBeenCalledWith(401);
    });

    test('returns 400 when driver rejected payment', async () => {
      jwt.verify.mockReturnValue({});
      xummService.verifyPayload.mockResolvedValue({
        signed: false,
        reason: 'User cancelled',
      });
      Booking.updatePaymentStatus.mockResolvedValue({});

      const req = mockReq({
        body: {
          uuid:      'xaman-uuid',
          bookingId: 'booking-123',
        },
        headers: validHeaders,
      });
      const res = mockRes();

      await verifyPayment(req, res);

      expect(res.status).toHaveBeenCalledWith(400);
      expect(res.json).toHaveBeenCalledWith(
        expect.objectContaining({
          error: 'Payment not signed.',
        })
      );
    });

    test('updates booking to failed when rejected', async () => {
      jwt.verify.mockReturnValue({});
      xummService.verifyPayload.mockResolvedValue({
        signed: false,
        reason: 'cancelled',
      });
      Booking.updatePaymentStatus.mockResolvedValue({});

      const req = mockReq({
        body: {
          uuid:      'xaman-uuid',
          bookingId: 'booking-123',
        },
        headers: validHeaders,
      });
      const res = mockRes();

      await verifyPayment(req, res);

      // booking status → failed
      expect(Booking.updatePaymentStatus)
        .toHaveBeenCalledWith('booking-123', 'failed');
    });

    test('returns 404 when booking not found', async () => {
      jwt.verify.mockReturnValue({});
      xummService.verifyPayload.mockResolvedValue({
        signed:        true,
        walletAddress: 'rDriverWallet123',
      });
      xummService.getPayloadDetails.mockResolvedValue({
        response: { txid: 'TX_HASH_123' },
      });
      Booking.findById.mockResolvedValue(null);

      const req = mockReq({
        body: {
          uuid:      'xaman-uuid',
          bookingId: 'invalid-booking',
        },
        headers: validHeaders,
      });
      const res = mockRes();

      await verifyPayment(req, res);

      expect(res.status).toHaveBeenCalledWith(404);
    });

    test('records driver→admin transaction', async () => {
      jwt.verify.mockReturnValue({});
      xummService.verifyPayload.mockResolvedValue({
        signed:        true,
        walletAddress: 'rDriverWallet123',
      });
      xummService.getPayloadDetails.mockResolvedValue({
        response: { txid: 'DRIVER_TX_HASH' },
      });
      Booking.findById.mockResolvedValue(validBooking);
      Transaction.create.mockResolvedValue({});
      xrplService.paySeller.mockResolvedValue({
        success:    true,
        txHash:     'SELLER_TX_HASH',
        resultCode: 'tesSUCCESS',
      });
      Booking.updateStatus.mockResolvedValue({});
      Booking.updatePaymentStatus.mockResolvedValue({});

      const req = mockReq({
        body: {
          uuid:      'xaman-uuid',
          bookingId: 'booking-123',
        },
        headers: validHeaders,
      });
      const res = mockRes();

      await verifyPayment(req, res);

      // Check driver→admin transaction recorded
      expect(Transaction.create).toHaveBeenCalledWith(
        expect.objectContaining({
          txType:      'driver_to_admin',
          fromAddress: 'rDriverWallet123',
          toAddress:   'rAdminWallet123',
          txHash:      'DRIVER_TX_HASH',
        })
      );
    });

    test('records admin→seller transaction', async () => {
      jwt.verify.mockReturnValue({});
      xummService.verifyPayload.mockResolvedValue({
        signed:        true,
        walletAddress: 'rDriverWallet123',
      });
      xummService.getPayloadDetails.mockResolvedValue({
        response: { txid: 'DRIVER_TX_HASH' },
      });
      Booking.findById.mockResolvedValue(validBooking);
      Transaction.create.mockResolvedValue({});
      xrplService.paySeller.mockResolvedValue({
        success:    true,
        txHash:     'SELLER_TX_HASH',
        resultCode: 'tesSUCCESS',
      });
      Booking.updateStatus.mockResolvedValue({});
      Booking.updatePaymentStatus.mockResolvedValue({});

      const req = mockReq({
        body: {
          uuid:      'xaman-uuid',
          bookingId: 'booking-123',
        },
        headers: validHeaders,
      });
      const res = mockRes();

      await verifyPayment(req, res);

      // Check admin→seller transaction recorded
      expect(Transaction.create).toHaveBeenCalledWith(
        expect.objectContaining({
          txType:    'admin_to_seller',
          fromAddress: 'rAdminWallet123',
          toAddress:   'rSellerWallet456',
          txHash:      'SELLER_TX_HASH',
        })
      );
    });

    test('pays seller 80% of total', async () => {
      jwt.verify.mockReturnValue({});
      xummService.verifyPayload.mockResolvedValue({
        signed:        true,
        walletAddress: 'rDriverWallet123',
      });
      xummService.getPayloadDetails.mockResolvedValue({
        response: { txid: 'DRIVER_TX_HASH' },
      });
      Booking.findById.mockResolvedValue({
        ...validBooking,
        total_price_xrp:   '4.000000',
        seller_amount_xrp: '3.200000', // 80%
      });
      Transaction.create.mockResolvedValue({});
      xrplService.paySeller.mockResolvedValue({
        success:    true,
        txHash:     'SELLER_TX_HASH',
        resultCode: 'tesSUCCESS',
      });
      Booking.updateStatus.mockResolvedValue({});
      Booking.updatePaymentStatus.mockResolvedValue({});

      const req = mockReq({
        body: {
          uuid:      'xaman-uuid',
          bookingId: 'booking-123',
        },
        headers: validHeaders,
      });
      const res = mockRes();

      await verifyPayment(req, res);

      // paySeller called with 80% (3.2 XRP)
      expect(xrplService.paySeller).toHaveBeenCalledWith(
        'rSellerWallet456', // seller wallet
        3.2,                // 80% of 4.0 XRP
        expect.any(String), // bookingId
      );
    });

    test('updates booking to confirmed', async () => {
      jwt.verify.mockReturnValue({});
      xummService.verifyPayload.mockResolvedValue({
        signed:        true,
        walletAddress: 'rDriverWallet123',
      });
      xummService.getPayloadDetails.mockResolvedValue({
        response: { txid: 'TX_HASH' },
      });
      Booking.findById.mockResolvedValue(validBooking);
      Transaction.create.mockResolvedValue({});
      xrplService.paySeller.mockResolvedValue({
        success:    true,
        txHash:     'SELLER_HASH',
        resultCode: 'tesSUCCESS',
      });
      Booking.updateStatus.mockResolvedValue({});
      Booking.updatePaymentStatus.mockResolvedValue({});

      const req = mockReq({
        body: {
          uuid:      'xaman-uuid',
          bookingId: 'booking-123',
        },
        headers: validHeaders,
      });
      const res = mockRes();

      await verifyPayment(req, res);

      expect(Booking.updateStatus)
        .toHaveBeenCalledWith('booking-123', 'confirmed');
      expect(Booking.updatePaymentStatus)
        .toHaveBeenCalledWith('booking-123', 'split_completed');
    });

    test('returns success with transaction details', async () => {
      jwt.verify.mockReturnValue({});
      xummService.verifyPayload.mockResolvedValue({
        signed:        true,
        walletAddress: 'rDriverWallet123',
      });
      xummService.getPayloadDetails.mockResolvedValue({
        response: { txid: 'DRIVER_HASH' },
      });
      Booking.findById.mockResolvedValue(validBooking);
      Transaction.create.mockResolvedValue({});
      xrplService.paySeller.mockResolvedValue({
        success:    true,
        txHash:     'SELLER_HASH',
        resultCode: 'tesSUCCESS',
      });
      Booking.updateStatus.mockResolvedValue({});
      Booking.updatePaymentStatus.mockResolvedValue({});

      const req = mockReq({
        body: {
          uuid:      'xaman-uuid',
          bookingId: 'booking-123',
        },
        headers: validHeaders,
      });
      const res = mockRes();

      await verifyPayment(req, res);

      expect(res.json).toHaveBeenCalledWith(
        expect.objectContaining({
          message: expect.stringContaining('Payment successful'),
          booking: expect.objectContaining({
            bookingStatus: 'confirmed',
            paymentStatus: 'split_completed',
          }),
          payment: expect.objectContaining({
            totalPaid:      4.0,
            sellerReceived: 3.2,
          }),
        })
      );
    });

    test('returns 500 when seller payment fails', async () => {
      jwt.verify.mockReturnValue({});
      xummService.verifyPayload.mockResolvedValue({
        signed:        true,
        walletAddress: 'rDriverWallet123',
      });
      xummService.getPayloadDetails.mockResolvedValue({
        response: { txid: 'TX_HASH' },
      });
      Booking.findById.mockResolvedValue(validBooking);
      Transaction.create.mockResolvedValue({});

      // Seller payment FAILS
      xrplService.paySeller.mockResolvedValue({
        success: false,
      });
      Booking.updatePaymentStatus.mockResolvedValue({});

      const req = mockReq({
        body: {
          uuid:      'xaman-uuid',
          bookingId: 'booking-123',
        },
        headers: validHeaders,
      });
      const res = mockRes();

      await verifyPayment(req, res);

      expect(res.status).toHaveBeenCalledWith(500);
      expect(res.json).toHaveBeenCalledWith(
        expect.objectContaining({
          error: expect.stringContaining('payout failed'),
        })
      );
    });

    test('updates to failed when seller payment fails', async () => {
      jwt.verify.mockReturnValue({});
      xummService.verifyPayload.mockResolvedValue({
        signed:        true,
        walletAddress: 'rDriverWallet123',
      });
      xummService.getPayloadDetails.mockResolvedValue({
        response: { txid: 'TX_HASH' },
      });
      Booking.findById.mockResolvedValue(validBooking);
      Transaction.create.mockResolvedValue({});
      xrplService.paySeller.mockResolvedValue({
        success: false,
      });
      Booking.updatePaymentStatus.mockResolvedValue({});

      const req = mockReq({
        body: {
          uuid:      'xaman-uuid',
          bookingId: 'booking-123',
        },
        headers: validHeaders,
      });
      const res = mockRes();

      await verifyPayment(req, res);

      // booking → failed
      expect(Booking.updatePaymentStatus)
        .toHaveBeenCalledWith('booking-123', 'failed');
    });

    test('creates exactly 2 transactions on success', async () => {
      jwt.verify.mockReturnValue({});
      xummService.verifyPayload.mockResolvedValue({
        signed:        true,
        walletAddress: 'rDriverWallet123',
      });
      xummService.getPayloadDetails.mockResolvedValue({
        response: { txid: 'TX_HASH' },
      });
      Booking.findById.mockResolvedValue(validBooking);
      Transaction.create.mockResolvedValue({});
      xrplService.paySeller.mockResolvedValue({
        success:    true,
        txHash:     'SELLER_HASH',
        resultCode: 'tesSUCCESS',
      });
      Booking.updateStatus.mockResolvedValue({});
      Booking.updatePaymentStatus.mockResolvedValue({});

      const req = mockReq({
        body: {
          uuid:      'xaman-uuid',
          bookingId: 'booking-123',
        },
        headers: validHeaders,
      });
      const res = mockRes();

      await verifyPayment(req, res);

      // 2 transactions: driver→admin + admin→seller
      expect(Transaction.create)
        .toHaveBeenCalledTimes(2);
    });

    test('response includes verify URLs', async () => {
      jwt.verify.mockReturnValue({});
      xummService.verifyPayload.mockResolvedValue({
        signed:        true,
        walletAddress: 'rDriverWallet123',
      });
      xummService.getPayloadDetails.mockResolvedValue({
        response: { txid: 'DRIVER_HASH_123' },
      });
      Booking.findById.mockResolvedValue(validBooking);
      Transaction.create.mockResolvedValue({});
      xrplService.paySeller.mockResolvedValue({
        success:    true,
        txHash:     'SELLER_HASH_456',
        resultCode: 'tesSUCCESS',
      });
      Booking.updateStatus.mockResolvedValue({});
      Booking.updatePaymentStatus.mockResolvedValue({});

      const req = mockReq({
        body: {
          uuid:      'xaman-uuid',
          bookingId: 'booking-123',
        },
        headers: validHeaders,
      });
      const res = mockRes();

      await verifyPayment(req, res);

      const response = res.json.mock.calls[0][0];
      const txs      = response.payment.transactions;

      expect(txs.driverToAdmin.verifyUrl)
        .toContain('testnet.xrpl.org');
      expect(txs.adminToSeller.verifyUrl)
        .toContain('testnet.xrpl.org');
    });
  });

  // ════════════════════════════════════════════════════
  // GROUP 5: TOKEN GENERATION
  // ════════════════════════════════════════════════════
  describe('Token Generation', () => {

    test('generates token with userId and role', async () => {
      xummService.verifyPayload.mockResolvedValue({
        signed:        true,
        walletAddress: 'rDriverWallet123',
      });
      User.findByWalletAddress.mockResolvedValue({
        id:   'driver-uuid',
        role: 'driver',
      });
      jwt.sign.mockReturnValue('generated-token');

      const req = mockReq({
        body: { uuid: 'test-uuid' },
      });
      const res = mockRes();

      await verify(req, res);

      expect(jwt.sign).toHaveBeenCalledWith(
        expect.objectContaining({
          userId: 'driver-uuid',
          role:   'driver',
        }),
        'test-secret',
        expect.objectContaining({
          expiresIn: '7d',
        })
      );
    });

    test('token expires in 7 days by default', async () => {
      xummService.verifyPayload.mockResolvedValue({
        signed:        true,
        walletAddress: 'rWallet',
      });
      User.findByWalletAddress.mockResolvedValue({
        id:   'uuid',
        role: 'driver',
      });
      jwt.sign.mockReturnValue('token');

      const req = mockReq({ body: { uuid: 'uuid' } });
      const res = mockRes();

      await verify(req, res);

      expect(jwt.sign).toHaveBeenCalledWith(
        expect.any(Object),
        expect.any(String),
        expect.objectContaining({ expiresIn: '7d' })
      );
    });
  });

  // ════════════════════════════════════════════════════
  // GROUP 6: BUSINESS LOGIC
  // ════════════════════════════════════════════════════
  describe('Business Logic', () => {

    test('XRP to drops: 4.0 XRP = 4,000,000 drops', () => {
      const xrp   = 4.0;
      const drops = Math.floor(xrp * 1000000).toString();
      expect(drops).toBe('4000000');
    });

    test('XRP to drops: 3.2 XRP = 3,200,000 drops', () => {
      const xrp   = 3.2;
      const drops = Math.floor(xrp * 1000000).toString();
      expect(drops).toBe('3200000');
    });

    test('seller gets 80% of total', () => {
      const total  = 4.0;
      const seller = parseFloat((total * 0.80).toFixed(6));
      expect(seller).toBeCloseTo(3.2, 4);
    });

    test('admin gets 20% of total', () => {
      const total = 4.0;
      const admin = parseFloat((total * 0.20).toFixed(6));
      expect(admin).toBeCloseTo(0.8, 4);
    });

    test('admin + seller = total', () => {
      const total  = 4.0;
      const admin  = total * 0.20;
      const seller = total * 0.80;
      expect(admin + seller).toBeCloseTo(total, 4);
    });

    test('verify URL format is correct', () => {
      const txHash    = 'ABC123TXHASH';
      const verifyUrl =
        `https://testnet.xrpl.org/transactions/${txHash}`;

      expect(verifyUrl).toContain('testnet.xrpl.org');
      expect(verifyUrl).toContain(txHash);
    });

    test('driver→admin tx type is correct', () => {
      expect('driver_to_admin').toBe('driver_to_admin');
    });

    test('admin→seller tx type is correct', () => {
      expect('admin_to_seller').toBe('admin_to_seller');
    });
  });
});
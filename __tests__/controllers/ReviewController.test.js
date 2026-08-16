// __tests__/controllers/ReviewController.test.js
jest.mock('../../src/models/Review');
jest.mock('../../src/models/Booking');

const Review = require('../../src/models/Review');
const Booking = require('../../src/models/Booking');
const ReviewController = require('../../src/controllers/ReviewController');

const mockReq = (overrides = {}) => ({
  body: {},
  params: {},
  query: {},
  user: { id: 'driver-uuid', role: 'driver' },
  ...overrides,
});

const mockRes = () => {
  const res = {};
  res.status = jest.fn().mockReturnValue(res);
  res.json = jest.fn().mockReturnValue(res);
  return res;
};

describe('ReviewController', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  describe('createReview()', () => {
    it('should return 400 if bookingId or rating missing', async () => {
      const req = mockReq({ body: { bookingId: 'b1' } }); // missing rating
      const res = mockRes();

      await ReviewController.createReview(req, res);

      expect(res.status).toHaveBeenCalledWith(400);
      expect(res.json).toHaveBeenCalledWith({ message: 'bookingId and rating are required' });
    });

    it('should return 400 if rating is invalid (<1 or >5)', async () => {
      const req = mockReq({ body: { bookingId: 'b1', rating: 6 } });
      const res = mockRes();

      await ReviewController.createReview(req, res);

      expect(res.status).toHaveBeenCalledWith(400);
      expect(res.json).toHaveBeenCalledWith({ message: 'Rating must be between 1 and 5' });
    });

    it('should return 404 if booking does not exist', async () => {
      const req = mockReq({ body: { bookingId: 'b1', rating: 5 } });
      const res = mockRes();
      Booking.findById.mockResolvedValue(null);

      await ReviewController.createReview(req, res);

      expect(res.status).toHaveBeenCalledWith(404);
      expect(res.json).toHaveBeenCalledWith({ message: 'Booking not found' });
    });

    it('should return 403 if booking does not belong to driver', async () => {
      const req = mockReq({ body: { bookingId: 'b1', rating: 5 } });
      const res = mockRes();
      Booking.findById.mockResolvedValue({ id: 'b1', driver_id: 'other-driver' });

      await ReviewController.createReview(req, res);

      expect(res.status).toHaveBeenCalledWith(403);
      expect(res.json).toHaveBeenCalledWith({ message: 'You can only review your own bookings' });
    });

    it('should return 400 if review already exists for booking', async () => {
      const req = mockReq({ body: { bookingId: 'b1', rating: 5 } });
      const res = mockRes();
      Booking.findById.mockResolvedValue({ id: 'b1', driver_id: 'driver-uuid' });
      Review.findByBooking.mockResolvedValue({ id: 1 });

      await ReviewController.createReview(req, res);

      expect(res.status).toHaveBeenCalledWith(400);
      expect(res.json).toHaveBeenCalledWith({ message: 'A review already exists for this booking' });
    });

    it('should create review successfully and return 201', async () => {
      const req = mockReq({ body: { bookingId: 'b1', rating: 5, comment: 'Nice' } });
      const res = mockRes();
      const mockCreated = { id: 1, rating: 5, comment: 'Nice' };
      Booking.findById.mockResolvedValue({ id: 'b1', driver_id: 'driver-uuid', spot_id: 's1' });
      Review.findByBooking.mockResolvedValue(null);
      Review.create.mockResolvedValue(mockCreated);

      await ReviewController.createReview(req, res);

      expect(Review.create).toHaveBeenCalledWith({
        bookingId: 'b1',
        driverId: 'driver-uuid',
        spotId: 's1',
        rating: 5,
        comment: 'Nice',
      });
      expect(res.status).toHaveBeenCalledWith(201);
      expect(res.json).toHaveBeenCalledWith({ message: 'Review created successfully', review: mockCreated });
    });

    it('should return 500 on createReview error', async () => {
      const req = mockReq({ body: { bookingId: 'b1', rating: 5 } });
      const res = mockRes();
      Booking.findById.mockRejectedValue(new Error('DB failure'));

      await ReviewController.createReview(req, res);

      expect(res.status).toHaveBeenCalledWith(500);
      expect(res.json).toHaveBeenCalledWith({ message: 'Failed to create review' });
    });
  });

  describe('getAllReviews()', () => {
    it('should return all reviews with pagination', async () => {
      const req = mockReq({ query: { limit: '10', offset: '0' } });
      const res = mockRes();
      const mockReviews = [{ id: 1 }, { id: 2 }];
      Review.findAll.mockResolvedValue(mockReviews);
      Review.countAll.mockResolvedValue(2);

      await ReviewController.getAllReviews(req, res);

      expect(res.status).toHaveBeenCalledWith(200);
      expect(res.json).toHaveBeenCalledWith({
        message: 'Reviews retrieved successfully',
        data: mockReviews,
        pagination: { total: 2, limit: 10, offset: 0, hasMore: false },
      });
    });

    it('should return 500 on getAllReviews error', async () => {
      const req = mockReq();
      const res = mockRes();
      Review.findAll.mockRejectedValue(new Error('DB failure'));

      await ReviewController.getAllReviews(req, res);

      expect(res.status).toHaveBeenCalledWith(500);
      expect(res.json).toHaveBeenCalledWith({ message: 'Failed to fetch reviews' });
    });
  });

  describe('getReviewByBooking()', () => {
    it('should return 404 if review not found for booking', async () => {
      const req = mockReq({ params: { bookingId: 'b1' } });
      const res = mockRes();
      Review.findByBooking.mockResolvedValue(null);

      await ReviewController.getReviewByBooking(req, res);

      expect(res.status).toHaveBeenCalledWith(404);
      expect(res.json).toHaveBeenCalledWith({ message: 'Review not found' });
    });

    it('should return review by booking ID', async () => {
      const req = mockReq({ params: { bookingId: 'b1' } });
      const res = mockRes();
      const mockRev = { id: 1, booking_id: 'b1' };
      Review.findByBooking.mockResolvedValue(mockRev);

      await ReviewController.getReviewByBooking(req, res);

      expect(res.status).toHaveBeenCalledWith(200);
      expect(res.json).toHaveBeenCalledWith({ message: 'Review retrieved successfully', data: mockRev });
    });

    it('should return 500 on getReviewByBooking error', async () => {
      const req = mockReq({ params: { bookingId: 'b1' } });
      const res = mockRes();
      Review.findByBooking.mockRejectedValue(new Error('DB failure'));

      await ReviewController.getReviewByBooking(req, res);

      expect(res.status).toHaveBeenCalledWith(500);
      expect(res.json).toHaveBeenCalledWith({ message: 'Failed to fetch review' });
    });
  });

  describe('getReviewsBySpot()', () => {
    it('should return reviews and stats for a spot', async () => {
      const req = mockReq({ params: { spotId: 's1' }, query: {} });
      const res = mockRes();
      const mockReviews = [{ id: 1, rating: 4.5 }];
      Review.findBySpot.mockResolvedValue(mockReviews);
      Review.countBySpot.mockResolvedValue(1);
      Review.getAverageRatingBySpot.mockResolvedValue(4.5);

      await ReviewController.getReviewsBySpot(req, res);

      expect(res.status).toHaveBeenCalledWith(200);
      expect(res.json).toHaveBeenCalledWith({
        message: 'Spot reviews retrieved successfully',
        data: mockReviews,
        stats: { averageRating: '4.50', totalReviews: 1 },
        pagination: { total: 1, limit: 20, offset: 0, hasMore: false },
      });
    });

    it('should return 500 on getReviewsBySpot error', async () => {
      const req = mockReq({ params: { spotId: 's1' } });
      const res = mockRes();
      Review.findBySpot.mockRejectedValue(new Error('DB failure'));

      await ReviewController.getReviewsBySpot(req, res);

      expect(res.status).toHaveBeenCalledWith(500);
      expect(res.json).toHaveBeenCalledWith({ message: 'Failed to fetch spot reviews' });
    });
  });

  describe('getSellerReviews()', () => {
    it('should return seller reviews for logged in seller', async () => {
      const req = mockReq({ user: { id: 'seller-uuid', role: 'seller' } });
      const res = mockRes();
      const mockReviews = [{ id: 1 }];
      Review.findByOwner.mockResolvedValue(mockReviews);
      Review.countByOwner.mockResolvedValue(1);

      await ReviewController.getSellerReviews(req, res);

      expect(Review.findByOwner).toHaveBeenCalledWith('seller-uuid', { limit: 20, offset: 0 });
      expect(res.status).toHaveBeenCalledWith(200);
      expect(res.json).toHaveBeenCalledWith(expect.objectContaining({ data: mockReviews }));
    });

    it('should allow admin to query another sellerId', async () => {
      const req = mockReq({ user: { id: 'admin-uuid', role: 'admin' }, query: { sellerId: 'target-seller' } });
      const res = mockRes();
      Review.findByOwner.mockResolvedValue([]);
      Review.countByOwner.mockResolvedValue(0);

      await ReviewController.getSellerReviews(req, res);

      expect(Review.findByOwner).toHaveBeenCalledWith('target-seller', { limit: 20, offset: 0 });
      expect(res.status).toHaveBeenCalledWith(200);
    });

    it('should return 500 on getSellerReviews failure', async () => {
      const req = mockReq();
      const res = mockRes();
      Review.findByOwner.mockRejectedValue(new Error('DB failure'));

      await ReviewController.getSellerReviews(req, res);

      expect(res.status).toHaveBeenCalledWith(500);
      expect(res.json).toHaveBeenCalledWith({ message: 'Failed to fetch your reviews' });
    });
  });

  describe('getDriverReviews()', () => {
    it('should return reviews for authenticated driver', async () => {
      const req = mockReq({ user: { id: 'driver-uuid', role: 'driver' } });
      const res = mockRes();
      const mockReviews = [{ id: 1 }];
      Review.findByDriver.mockResolvedValue(mockReviews);
      Review.countByDriver.mockResolvedValue(1);

      await ReviewController.getDriverReviews(req, res);

      expect(Review.findByDriver).toHaveBeenCalledWith('driver-uuid', { limit: 20, offset: 0 });
      expect(res.status).toHaveBeenCalledWith(200);
      expect(res.json).toHaveBeenCalledWith(expect.objectContaining({ data: mockReviews }));
    });

    it('should return 500 on getDriverReviews failure', async () => {
      const req = mockReq();
      const res = mockRes();
      Review.findByDriver.mockRejectedValue(new Error('DB failure'));

      await ReviewController.getDriverReviews(req, res);

      expect(res.status).toHaveBeenCalledWith(500);
      expect(res.json).toHaveBeenCalledWith({ message: 'Failed to fetch your reviews' });
    });
  });

  describe('getReviewById()', () => {
    it('should return 404 if review not found', async () => {
      const req = mockReq({ params: { id: '99' } });
      const res = mockRes();
      Review.findById.mockResolvedValue(null);

      await ReviewController.getReviewById(req, res);

      expect(res.status).toHaveBeenCalledWith(404);
      expect(res.json).toHaveBeenCalledWith({ message: 'Review not found' });
    });

    it('should return review by ID', async () => {
      const req = mockReq({ params: { id: '1' } });
      const res = mockRes();
      const mockReview = { id: 1, rating: 5 };
      Review.findById.mockResolvedValue(mockReview);

      await ReviewController.getReviewById(req, res);

      expect(res.status).toHaveBeenCalledWith(200);
      expect(res.json).toHaveBeenCalledWith({ message: 'Review retrieved successfully', review: mockReview });
    });

    it('should return 500 on getReviewById failure', async () => {
      const req = mockReq({ params: { id: '1' } });
      const res = mockRes();
      Review.findById.mockRejectedValue(new Error('DB failure'));

      await ReviewController.getReviewById(req, res);

      expect(res.status).toHaveBeenCalledWith(500);
      expect(res.json).toHaveBeenCalledWith({ message: 'Failed to fetch review' });
    });
  });

  describe('updateReview()', () => {
    it('should return 400 if updated rating is invalid', async () => {
      const req = mockReq({ params: { id: '1' }, body: { rating: 6 } });
      const res = mockRes();

      await ReviewController.updateReview(req, res);

      expect(res.status).toHaveBeenCalledWith(400);
      expect(res.json).toHaveBeenCalledWith({ message: 'Rating must be between 1 and 5' });
    });

    it('should return 404 if review not found', async () => {
      const req = mockReq({ params: { id: '1' }, body: { rating: 4 } });
      const res = mockRes();
      Review.findById.mockResolvedValue(null);

      await ReviewController.updateReview(req, res);

      expect(res.status).toHaveBeenCalledWith(404);
      expect(res.json).toHaveBeenCalledWith({ message: 'Review not found' });
    });

    it('should return 403 if review does not belong to driver', async () => {
      const req = mockReq({ params: { id: '1' }, body: { rating: 4 } });
      const res = mockRes();
      Review.findById.mockResolvedValue({ id: 1, driver_id: 'other-driver' });

      await ReviewController.updateReview(req, res);

      expect(res.status).toHaveBeenCalledWith(403);
      expect(res.json).toHaveBeenCalledWith({ message: 'You can only update your own reviews' });
    });

    it('should update review successfully and return 200', async () => {
      const req = mockReq({ params: { id: '1' }, body: { rating: 4, comment: 'Better' } });
      const res = mockRes();
      const mockUpdated = { id: 1, rating: 4, comment: 'Better' };
      Review.findById.mockResolvedValue({ id: 1, driver_id: 'driver-uuid' });
      Review.update.mockResolvedValue(mockUpdated);

      await ReviewController.updateReview(req, res);

      expect(Review.update).toHaveBeenCalledWith('1', { rating: 4, comment: 'Better' });
      expect(res.status).toHaveBeenCalledWith(200);
      expect(res.json).toHaveBeenCalledWith({ message: 'Review updated successfully', review: mockUpdated });
    });

    it('should return 500 on updateReview failure', async () => {
      const req = mockReq({ params: { id: '1' }, body: { rating: 4 } });
      const res = mockRes();
      Review.findById.mockRejectedValue(new Error('DB failure'));

      await ReviewController.updateReview(req, res);

      expect(res.status).toHaveBeenCalledWith(500);
      expect(res.json).toHaveBeenCalledWith({ message: 'Failed to update review' });
    });
  });

  describe('deleteReview()', () => {
    it('should return 404 if review not found', async () => {
      const req = mockReq({ params: { id: '1' } });
      const res = mockRes();
      Review.findById.mockResolvedValue(null);

      await ReviewController.deleteReview(req, res);

      expect(res.status).toHaveBeenCalledWith(404);
      expect(res.json).toHaveBeenCalledWith({ message: 'Review not found' });
    });

    it('should return 403 if review belongs to another driver', async () => {
      const req = mockReq({ params: { id: '1' } });
      const res = mockRes();
      Review.findById.mockResolvedValue({ id: 1, driver_id: 'other-driver' });

      await ReviewController.deleteReview(req, res);

      expect(res.status).toHaveBeenCalledWith(403);
      expect(res.json).toHaveBeenCalledWith({ message: 'You can only delete your own reviews' });
    });

    it('should delete review successfully and return 200', async () => {
      const req = mockReq({ params: { id: '1' } });
      const res = mockRes();
      Review.findById.mockResolvedValue({ id: 1, driver_id: 'driver-uuid' });
      Review.delete.mockResolvedValue(true);

      await ReviewController.deleteReview(req, res);

      expect(Review.delete).toHaveBeenCalledWith('1');
      expect(res.status).toHaveBeenCalledWith(200);
      expect(res.json).toHaveBeenCalledWith({ message: 'Review deleted successfully' });
    });

    it('should return 500 on deleteReview failure', async () => {
      const req = mockReq({ params: { id: '1' } });
      const res = mockRes();
      Review.findById.mockRejectedValue(new Error('DB failure'));

      await ReviewController.deleteReview(req, res);

      expect(res.status).toHaveBeenCalledWith(500);
      expect(res.json).toHaveBeenCalledWith({ message: 'Failed to delete review' });
    });
  });
});

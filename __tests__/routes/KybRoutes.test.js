// __tests__/routes/KybRoutes.test.js

const mockRouter = {
    post: jest.fn(),
};

jest.mock('express', () => ({
    Router: jest.fn(() => mockRouter),
}));

jest.mock('../../src/middleware/AuthMiddleware', () => jest.fn((req, res, next) => next()));
jest.mock('../../src/controllers/KybController', () => ({
    submitKyb: jest.fn(),
}));

// Mock cloudinary.js upload to simulate multer errors
const mockUploadSingle = jest.fn();
jest.mock('../../src/config/cloudinary', () => ({
    upload: {
        single: jest.fn(() => mockUploadSingle),
    },
}));

const express = require('express');
const authMiddleware = require('../../src/middleware/AuthMiddleware');
const KybController = require('../../src/controllers/KybController');
const { upload } = require('../../src/config/cloudinary');

let handleUpload;

describe('KybRoutes', () => {
    beforeAll(() => {
        jest.clearAllMocks();
        require('../../src/routes/KybRoutes');
        handleUpload = mockRouter.post.mock.calls[0][2];
    });

    it('should register POST / with auth middleware, handleUpload, and KybController.submitKyb', () => {
        expect(express.Router).toHaveBeenCalled();
        expect(mockRouter.post).toHaveBeenCalledWith(
            '/',
            authMiddleware,
            expect.any(Function),
            KybController.submitKyb
        );
    });

    it('should respond with 400 and clear message if multer size limit error is hit', () => {
        mockUploadSingle.mockImplementation((req, res, callback) => {
            const err = new Error('File too large');
            err.code = 'LIMIT_FILE_SIZE';
            callback(err);
        });

        const req = {};
        const res = {
            status: jest.fn().mockReturnThis(),
            json: jest.fn().mockReturnThis(),
        };
        const next = jest.fn();

        handleUpload(req, res, next);

        expect(res.status).toHaveBeenCalledWith(400);
        expect(res.json).toHaveBeenCalledWith({ error: 'File size exceeds the 5 MB limit.' });
        expect(next).not.toHaveBeenCalled();
    });

    it('should respond with 400 and clear message if multer custom mimetype error is hit', () => {
        mockUploadSingle.mockImplementation((req, res, callback) => {
            const err = new Error('Unsupported file type. Allowed types: JPG, JPEG, PNG.');
            callback(err);
        });

        const req = {};
        const res = {
            status: jest.fn().mockReturnThis(),
            json: jest.fn().mockReturnThis(),
        };
        const next = jest.fn();

        handleUpload(req, res, next);

        expect(res.status).toHaveBeenCalledWith(400);
        expect(res.json).toHaveBeenCalledWith({ error: 'Unsupported file type. Allowed types: JPG, JPEG, PNG.' });
        expect(next).not.toHaveBeenCalled();
    });

    it('should call next() if no error occurs during upload', () => {
        mockUploadSingle.mockImplementation((req, res, callback) => {
            callback(null);
        });

        const req = {};
        const res = {
            status: jest.fn().mockReturnThis(),
            json: jest.fn().mockReturnThis(),
        };
        const next = jest.fn();

        handleUpload(req, res, next);

        expect(next).toHaveBeenCalled();
        expect(res.status).not.toHaveBeenCalled();
    });
});

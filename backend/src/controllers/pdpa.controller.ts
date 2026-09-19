import { Response } from 'express';
import { AuthRequest, UserRole } from '../middlewares/auth.js';
import pdpaService, { ConsentTypes, DataRequestTypes } from '../services/pdpa.service.js';

// Grant consent
export const grantConsent = async (req: AuthRequest, res: Response) => {
  try {
    const userId = req.user?.id;
    if (!userId) {
      return res.status(401).json({ error: 'Unauthorized' });
    }

    const { consentType, version } = req.body;

    if (!consentType || !version) {
      return res.status(400).json({ error: 'Missing consentType or version' });
    }

    // Validate consent type
    if (!Object.values(ConsentTypes).includes(consentType)) {
      return res.status(400).json({ error: 'Invalid consent type' });
    }

    await pdpaService.grantConsent(userId, consentType, version, req);

    res.json({ success: true });
  } catch (error) {
    console.error('Grant consent error:', error);
    res.status(500).json({ error: 'Failed to grant consent' });
  }
};

// Revoke consent
export const revokeConsent = async (req: AuthRequest, res: Response) => {
  try {
    const userId = req.user?.id;
    if (!userId) {
      return res.status(401).json({ error: 'Unauthorized' });
    }

    const { consentType } = req.body;

    if (!consentType) {
      return res.status(400).json({ error: 'Missing consentType' });
    }

    // Some consents cannot be revoked (required for service)
    if (consentType === ConsentTypes.PRIVACY_POLICY || consentType === ConsentTypes.TERMS_OF_SERVICE) {
      return res.status(400).json({
        error: 'Cannot revoke required consent. You may delete your account instead.',
      });
    }

    await pdpaService.revokeConsent(userId, consentType, req);

    res.json({ success: true });
  } catch (error) {
    console.error('Revoke consent error:', error);
    res.status(500).json({ error: 'Failed to revoke consent' });
  }
};

// Get user consents
export const getConsents = async (req: AuthRequest, res: Response) => {
  try {
    const userId = req.user?.id;
    if (!userId) {
      return res.status(401).json({ error: 'Unauthorized' });
    }

    const consents = await pdpaService.getUserConsents(userId);

    res.json({ consents });
  } catch (error) {
    console.error('Get consents error:', error);
    res.status(500).json({ error: 'Failed to get consents' });
  }
};

// Create data request
export const createDataRequest = async (req: AuthRequest, res: Response) => {
  try {
    const userId = req.user?.id;
    if (!userId) {
      return res.status(401).json({ error: 'Unauthorized' });
    }

    const { requestType, description } = req.body;

    if (!requestType) {
      return res.status(400).json({ error: 'Missing requestType' });
    }

    // Validate request type
    if (!Object.values(DataRequestTypes).includes(requestType)) {
      return res.status(400).json({ error: 'Invalid request type' });
    }

    const dataRequest = await pdpaService.createDataRequest(userId, requestType, description, req);

    res.json({ success: true, request: dataRequest });
  } catch (error) {
    console.error('Create data request error:', error);
    res.status(500).json({ error: 'Failed to create data request' });
  }
};

// Get user's data requests
export const getMyDataRequests = async (req: AuthRequest, res: Response) => {
  try {
    const userId = req.user?.id;
    if (!userId) {
      return res.status(401).json({ error: 'Unauthorized' });
    }

    const requests = await pdpaService.getUserDataRequests(userId);

    res.json({ requests });
  } catch (error) {
    console.error('Get data requests error:', error);
    res.status(500).json({ error: 'Failed to get data requests' });
  }
};

// Export user data
export const exportMyData = async (req: AuthRequest, res: Response) => {
  try {
    const userId = req.user?.id;
    if (!userId) {
      return res.status(401).json({ error: 'Unauthorized' });
    }

    const exportData = await pdpaService.exportUserData(userId);

    // Set headers for file download
    res.setHeader('Content-Type', 'application/json');
    res.setHeader('Content-Disposition', `attachment; filename="my-data-${Date.now()}.json"`);

    res.json(exportData);
  } catch (error) {
    console.error('Export data error:', error);
    res.status(500).json({ error: 'Failed to export data' });
  }
};

// Delete user data
export const deleteMyData = async (req: AuthRequest, res: Response) => {
  try {
    const userId = req.user?.id;
    if (!userId) {
      return res.status(401).json({ error: 'Unauthorized' });
    }

    const { confirmation } = req.body;

    if (confirmation !== 'DELETE_MY_DATA') {
      return res.status(400).json({
        error: 'Please confirm deletion by sending { confirmation: "DELETE_MY_DATA" }',
      });
    }

    await pdpaService.deleteUserData(userId, req);

    // Clear cookie
    res.clearCookie('token');

    res.json({
      success: true,
      message: 'Your data has been deleted. You will be logged out.',
    });
  } catch (error) {
    console.error('Delete data error:', error);
    res.status(500).json({ error: 'Failed to delete data' });
  }
};

// Get active policy
export const getPolicy = async (req: AuthRequest, res: Response) => {
  try {
    const { type } = req.params;

    const policy = await pdpaService.getActivePolicy(type);

    if (!policy) {
      return res.status(404).json({ error: 'Policy not found' });
    }

    res.json({ policy });
  } catch (error) {
    console.error('Get policy error:', error);
    res.status(500).json({ error: 'Failed to get policy' });
  }
};

// ===== Admin Endpoints =====

// Get all data requests (admin)
export const getAllDataRequests = async (req: AuthRequest, res: Response) => {
  try {
    if (!req.user || ![UserRole.ADMIN, UserRole.ROOT].includes(req.user.role)) {
      return res.status(403).json({ error: 'Admin access required' });
    }

    const { status, requestType, page, limit } = req.query;

    const result = await pdpaService.getAllDataRequests({
      status: status as string,
      requestType: requestType as string,
      page: page ? parseInt(page as string) : 1,
      limit: limit ? parseInt(limit as string) : 20,
    });

    res.json(result);
  } catch (error) {
    console.error('Get all data requests error:', error);
    res.status(500).json({ error: 'Failed to get data requests' });
  }
};

// Process data request (admin)
export const processDataRequest = async (req: AuthRequest, res: Response) => {
  try {
    if (!req.user || ![UserRole.ADMIN, UserRole.ROOT].includes(req.user.role)) {
      return res.status(403).json({ error: 'Admin access required' });
    }

    const { id } = req.params;
    const { status, response } = req.body;

    const dataRequest = await pdpaService.processDataRequest(
      parseInt(id),
      req.user.id,
      status,
      response
    );

    res.json({ success: true, request: dataRequest });
  } catch (error) {
    console.error('Process data request error:', error);
    res.status(500).json({ error: 'Failed to process data request' });
  }
};

// Create policy version (admin)
export const createPolicy = async (req: AuthRequest, res: Response) => {
  try {
    if (!req.user || ![UserRole.ADMIN, UserRole.ROOT].includes(req.user.role)) {
      return res.status(403).json({ error: 'Admin access required' });
    }

    const { type, version, content, contentTh, effectiveAt, isActive } = req.body;

    if (!type || !version || !content || !effectiveAt) {
      return res.status(400).json({ error: 'Missing required fields' });
    }

    const policy = await pdpaService.createPolicyVersion({
      type,
      version,
      content,
      contentTh,
      effectiveAt: new Date(effectiveAt),
      isActive,
    });

    res.json({ success: true, policy });
  } catch (error) {
    console.error('Create policy error:', error);
    res.status(500).json({ error: 'Failed to create policy' });
  }
};

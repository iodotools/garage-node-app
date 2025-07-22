const { Router } = require('express');
const { AuthService } = require('../../services/auth/auth.service');
const { authMiddleware } = require('../../middleware/auth/auth.middleware');


const router = Router();
const authService = new AuthService();
 

//## Endpoint Register
router.post('/register', async (req, res) => {
    try {
      const { email, password, name, role, avatar_url,display_name,gender,birth_date,asset_user_id  } = req.body;
      
      const user = await authService.register(email, password, name, role, avatar_url,display_name,gender,birth_date,asset_user_id);
      res.status(201).json(user);
    } catch (error) {
      res.status(400).json({ message: error?.message || 'Registration failed' });
    }
});

//## Endpoint Login
router.post('/login', async (req, res) => {
    try {
      const { email, password } = req.body;
      const tokens = await authService.login(email, password);
      res.json(tokens);
    } catch (error) {
      res.status(401).json({ message: error?.message || 'Login failed' });
    }
});


//## Endpoint Refresh Token
router.post('/refresh-token', async (req, res) => {
    try {
      const { refreshToken } = req.body;
      const result = await authService.refreshToken(refreshToken);
      res.json(result);
    } catch (error) {
      res.status(401).json({ message: error?.message || 'Token refresh failed' });
    }
  });
  


//## Endpoint Logout
router.post('/logout', async (req, res) => {
    try {
      const { refreshToken, accessToken } = req.body;
      await authService.logout(refreshToken, accessToken);
      res.json({ message: 'Logged out successfully' });
    } catch (error) {
      res.status(400).json({ message: error?.message || 'Logout failed' });
    }
  });
  


//## Endpoint Me
router.get('/me', authMiddleware, async (req, res) => {
    try {
      // req.user is guaranteed to exist after authMiddleware
      const user = await authService.getUser(parseInt(req.user.id));
      res.json(user);
    } catch (error) {
      res.status(404).json({ message: error?.message || 'User not found' });
    }
  });


//## Endpoint Check Email
router.get('/check-email', async (req, res) => {
  try {
    const { email } = req.query;
    const result = await authService.checkEmailExists(email);
    res.json(result);
  } catch (error) {
    res.status(400).json({ message: error?.message || 'Email check failed' });
  }
});


module.exports = router;

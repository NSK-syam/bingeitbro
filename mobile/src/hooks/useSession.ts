const React = require('react');
const { AuthContext } = require('../providers/AuthProvider');

function useSession() {
  const value = React.useContext(AuthContext);

  if (!value) {
    throw new Error('useSession must be used within an AuthProvider');
  }

  return value;
}

exports.useSession = useSession;

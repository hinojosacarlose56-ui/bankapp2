import "../../styles/header.css";

function Header({ user, onLogout }) {
  return (
    <header className="card header-row">
      <div>
        <h1>Bank Admin Platform</h1>
        <p>
          Logged in as {user.firstName} {user.lastName} ({user.role})
        </p>
      </div>
      <button onClick={onLogout}>Log Out</button>
    </header>
  );
}

export default Header;

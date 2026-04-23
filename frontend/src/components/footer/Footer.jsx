import "../../styles/footer.css";

function Footer({ message }) {
  return (
    <footer className="card">
      <p className="message">{message}</p>
    </footer>
  );
}

export default Footer;

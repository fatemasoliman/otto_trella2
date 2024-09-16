class Drawer {
	constructor() {
		this.createDrawer();
		this.initializeEventListeners();
		this.selectedEmail = null;
	}

	createDrawer() {
		const drawerHTML = `
			<div id="ottofill-drawer" class="drawer">
				<div class="drawer-content">
					<h2>OttoFill</h2>
					<button id="login-button">Login</button>
					<div id="user-info"></div>
					<div id="email-list"></div>
					<div id="email-preview"></div>
					<button id="ottofill-button" style="display: none;">OttoFill</button>
				</div>
			</div>
			<div id="drawer-tab"></div>
			`;

		const drawerContainer = document.createElement('div');
		drawerContainer.id = 'ottofill-container';
		drawerContainer.innerHTML = drawerHTML;
		document.body.appendChild(drawerContainer);

		this.drawer = document.getElementById('ottofill-drawer');
		this.tab = document.getElementById('drawer-tab');
	}

	initializeEventListeners() {
		const loginButton = document.getElementById('login-button');
		const ottoFillButton = document.getElementById('ottofill-button');
		
		loginButton.addEventListener('click', () => this.handleLogin());
		ottoFillButton.addEventListener('click', () => this.handleOttoFill());
		this.tab.addEventListener('click', () => this.toggleDrawer());

		// Add listener for email selection
		document.getElementById('email-list').addEventListener('click', (e) => {
			if (e.target.tagName === 'LI') {
				this.selectEmail(e.target.dataset.emailId);
			}
		});
	}

	toggleDrawer() {
		this.drawer.classList.toggle('open');
		this.tab.classList.toggle('open');
	}

	handleLogin() {
		window.postMessage({ type: 'OTTOFILL_LOGIN' }, '*');
	}

	updateUIForLoggedInUser() {
		const userInfo = document.getElementById('user-info');
		const loginButton = document.getElementById('login-button');
		const ottoFillButton = document.getElementById('ottofill-button');

		userInfo.textContent = 'Logged in';
		loginButton.style.display = 'none';
		ottoFillButton.style.display = 'block';
	}

	fetchEmails() {
		window.postMessage({ type: 'OTTOFILL_GET_EMAILS' }, '*');
	}

	displayEmails(emails) {
		const emailList = document.getElementById('email-list');
		emailList.innerHTML = '';
		emails.forEach(email => {
			const li = document.createElement('li');
			li.textContent = email.subject;
			li.dataset.emailId = email.id;
			emailList.appendChild(li);
		});
	}

	selectEmail(emailId) {
		window.postMessage({ type: 'OTTOFILL_GET_EMAIL_DETAILS', emailId }, '*');
	}

	updateEmailPreview(email) {
		const preview = document.getElementById('email-preview');
		preview.innerHTML = `
			<h3>${email.subject}</h3>
			<p>From: ${email.from}</p>
			<p>${email.body}</p>
		`;
	}

	handleOttoFill() {
		if (!this.selectedEmail) {
			alert('Please select an email first');
			return;
		}

		window.postMessage({ 
			type: 'OTTOFILL_PROCESS', 
			emailData: {
				subject: this.selectedEmail.subject,
				body: this.selectedEmail.body
			}
		}, '*');
	}
}

window.OttoFillDrawer = new Drawer();

// Listen for messages from content script
window.addEventListener('message', (event) => {
	if (event.data.type === 'OTTOFILL_EMAILS_RECEIVED') {
		window.OttoFillDrawer.displayEmails(event.data.emails);
	} else if (event.data.type === 'OTTOFILL_EMAIL_DETAILS_RECEIVED') {
		window.OttoFillDrawer.updateEmailPreview(event.data.email);
	} else if (event.data.type === 'OTTOFILL_LOGIN_SUCCESS') {
		window.OttoFillDrawer.updateUIForLoggedInUser();
		window.OttoFillDrawer.fetchEmails();
	}
});
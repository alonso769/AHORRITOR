import { initializeApp } from "https://www.gstatic.com/firebasejs/10.8.1/firebase-app.js";
import { getAuth, signInWithEmailAndPassword, createUserWithEmailAndPassword, onAuthStateChanged, signOut } from "https://www.gstatic.com/firebasejs/10.8.1/firebase-auth.js";
import { initializeFirestore, collection, addDoc, query, where, onSnapshot, serverTimestamp, orderBy } from "https://www.gstatic.com/firebasejs/10.8.1/firebase-firestore.js";

const firebaseConfig = {
  apiKey: "AIzaSyCWY8GF46w4mlQG1JBVTscDvK8mHyO_PgM",
  authDomain: "ahorritor.firebaseapp.com",
  projectId: "ahorritor",
  storageBucket: "ahorritor.firebasestorage.app",
  messagingSenderId: "745617539123",
  appId: "1:745617539123:web:02e23c0a26cbffda98e346",
  measurementId: "G-DMJ5MZGGL3"
};

let app, auth, db;
try {
    app = initializeApp(firebaseConfig);
    auth = getAuth(app);
    db = initializeFirestore(app, { experimentalForceLongPolling: true });
} catch (error) { console.error(error); }

let currentUser = null;
let expensesChart = null;
let allTransactions = []; 
let globalAhorroTotal = 0; 

const overlay = document.getElementById('loading-overlay');
const loginScreen = document.getElementById('login-screen');
const dashboardScreen = document.getElementById('dashboard-screen');
const btnAdd = document.getElementById('btn-add');
const errorMsg = document.getElementById('login-error');
const monthFilter = document.getElementById('month-filter');
const dateDisplay = document.getElementById('current-date-display');
const typeSelect = document.getElementById('type');
const categorySelect = document.getElementById('category');

// Elementos de Simulación y Salida Rápida
const btnSimulate = document.getElementById('btn-calculate');
const inputFixIncome = document.getElementById('fixed-income');
const inputFixExpense = document.getElementById('fixed-expenses');
const tableBody = document.getElementById('projection-body');
const tableContainer = document.getElementById('projection-results');

const btnOut = document.getElementById('btn-out');
const outAmountInput = document.getElementById('out-amount');

// ==========================================
// CATEGORÍAS DINÁMICAS (Actualizadas)
// ==========================================
const categoryOptions = {
    expense: [
        { value: "Comida", text: "🍔 Comida" },
        { value: "Salidas_Ocio", text: "🍻 Salidas / Ocio" }, // NUEVO
        { value: "Salud", text: "💊 Salud" },
        { value: "Educacion", text: "📚 Educación" },
        { value: "Transporte", text: "🚌 Transporte" },
        { value: "Servicios", text: "💡 Servicios" },
        { value: "Otros", text: "🛒 Otros Gastos" }
    ],
    income: [
        { value: "Sueldo", text: "💼 Sueldo / Trabajo" },
        { value: "Negocio", text: "🏪 Ingreso por Negocio" },
        { value: "Pago_Recibido", text: "🤝 Me pagaron una deuda" },
        { value: "Otros_Ingresos", text: "💰 Otros Ingresos" }
    ],
    saving: [
        { value: "Alcancía", text: "🐷 Directo al Chanchito" },
        { value: "Inversion", text: "📈 Inversión" },
        { value: "Ahorro_Inicial", text: "🏦 Ahorro Previo / Inicial" } 
    ]
};

function actualizarCategorias() {
    const selectedType = typeSelect.value;
    categorySelect.innerHTML = ""; 
    categoryOptions[selectedType].forEach(cat => {
        const option = document.createElement("option");
        option.value = cat.value;
        option.innerText = cat.text;
        categorySelect.appendChild(option);
    });
}
typeSelect.addEventListener('change', actualizarCategorias);
actualizarCategorias();

function evaluarSumaMatematica(textoCaja) {
    if (!textoCaja) return 0;
    let sumaTotal = 0;
    const partes = textoCaja.split('+');
    partes.forEach(parte => {
        const numero = parseFloat(parte.trim());
        if (!isNaN(numero)) sumaTotal += numero;
    });
    return sumaTotal;
}

// Lógica de Simulación
btnSimulate.addEventListener('click', () => {
    const ingFijo = evaluarSumaMatematica(inputFixIncome.value);
    const gasFijo = evaluarSumaMatematica(inputFixExpense.value);

    if(ingFijo === 0 && gasFijo === 0) return alert("Por favor ingresa montos válidos para simular.");

    const capacidadAhorroMensual = ingFijo - gasFijo;

    if(capacidadAhorroMensual <= 0) return alert("¡Cuidado! Tus gastos superan tus ingresos.");

    tableBody.innerHTML = "";
    tableContainer.style.display = "block";

    const periodos = [{ mes: 1, label: "En 1 Mes" }, { mes: 3, label: "En 3 Meses" }, { mes: 6, label: "En 6 Meses" }, { mes: 12, label: "En 1 Año (12 Meses)" }];

    periodos.forEach(p => {
        const futuroAhorro = globalAhorroTotal + (capacidadAhorroMensual * p.mes);
        const row = document.createElement("tr");
        row.innerHTML = `
            <td>${p.label}</td>
            <td class="projection-highlight">S/ ${futuroAhorro.toFixed(2)}</td>
            <td><i class="fa-solid fa-arrow-trend-up" style="color: #2ed573;"></i> Creciendo</td>
        `;
        tableBody.appendChild(row);
    });
});

function configurarFechas() {
    const today = new Date();
    const options = { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric' };
    if(dateDisplay) dateDisplay.innerText = "Hoy es: " + today.toLocaleDateString('es-ES', options);
    
    const currentMonthFormated = `${today.getFullYear()}-${String(today.getMonth() + 1).padStart(2, '0')}`;
    if(monthFilter) monthFilter.value = currentMonthFormated;
}
configurarFechas();

monthFilter?.addEventListener('change', () => { procesarYRenderizarDashboard(); });
function hideLoader() { overlay.classList.add('loading-hidden'); }
function showScreen(screenToShow) {
    loginScreen.classList.remove('active-screen'); dashboardScreen.classList.remove('active-screen');
    setTimeout(() => { screenToShow.classList.add('active-screen'); }, 50);
}

if(auth) {
    onAuthStateChanged(auth, (user) => {
        setTimeout(() => {
            hideLoader();
            if (user) {
                currentUser = user;
                showScreen(dashboardScreen);
                descargarTodaLaData(); 
            } else {
                currentUser = null;
                showScreen(loginScreen);
                if(expensesChart) expensesChart.destroy();
            }
        }, 2500); 
    });
}

document.getElementById('btn-login')?.addEventListener('click', async () => {
    const e = document.getElementById('email').value, p = document.getElementById('password').value;
    if(!e || !p) return errorMsg.innerText = "Completa los campos.";
    try { errorMsg.innerText = "Entrando..."; await signInWithEmailAndPassword(auth, e, p); errorMsg.innerText = ""; } 
    catch(error) { errorMsg.innerText = "Correo o contraseña incorrectos."; }
});

document.getElementById('btn-register')?.addEventListener('click', async () => {
    const e = document.getElementById('email').value, p = document.getElementById('password').value;
    if(!e || !p) return errorMsg.innerText = "Completa los campos.";
    try { errorMsg.innerText = "Creando..."; await createUserWithEmailAndPassword(auth, e, p); errorMsg.innerText = ""; } 
    catch(error) { errorMsg.innerText = error.code === 'auth/weak-password' ? "Mínimo 6 caracteres." : "Error al registrar."; }
});

document.getElementById('btn-logout')?.addEventListener('click', () => signOut(auth));

// ==========================================
// FUNCIÓN MODO SALIDA RÁPIDA
// ==========================================
btnOut?.addEventListener('click', async () => {
    const amount = parseFloat(outAmountInput.value);
    if (!amount || amount <= 0) return alert("¡Ingresa cuánto gastaste en tu salida!");

    const originalText = btnOut.innerHTML;
    btnOut.innerHTML = '<i class="fa-solid fa-spinner fa-spin"></i> Guardando...'; 
    btnOut.disabled = true;

    try {
        await addDoc(collection(db, "transactions"), {
            uid: currentUser.uid, 
            type: 'expense', 
            amount: amount, 
            category: "Salidas_Ocio", // Asigna automáticamente la categoría de Salidas
            date: serverTimestamp()
        });
        
        outAmountInput.value = ''; 
        btnOut.innerHTML = '<i class="fa-solid fa-check"></i> ¡Salida Registrada!';
        btnOut.style.background = 'linear-gradient(135deg, #2ed573, #7bed9f)';
        
        setTimeout(() => { btnOut.innerHTML = originalText; btnOut.style.background = ''; btnOut.disabled = false; }, 2000);
    } catch (error) { 
        alert("Error al guardar."); 
        btnOut.innerHTML = originalText; btnOut.disabled = false; 
    }
});


// FUNCIÓN DE GUARDADO NORMAL
btnAdd?.addEventListener('click', async () => {
    const type = document.getElementById('type').value;
    const amountInput = document.getElementById('amount');
    const category = document.getElementById('category').value;
    const amount = parseFloat(amountInput.value);

    if (!amount || amount <= 0) return alert("¡Monto inválido!");

    const originalText = btnAdd.innerHTML;
    btnAdd.innerHTML = '<i class="fa-solid fa-spinner fa-spin"></i> Guardando...'; 
    btnAdd.disabled = true;

    try {
        await addDoc(collection(db, "transactions"), {
            uid: currentUser.uid, type: type, amount: amount, category: category,
            date: serverTimestamp()
        });
        
        amountInput.value = ''; 
        btnAdd.innerHTML = '<i class="fa-solid fa-check"></i> ¡Guardado!';
        btnAdd.style.background = 'linear-gradient(135deg, #2ed573, #7bed9f)';
        
        setTimeout(() => { btnAdd.innerHTML = originalText; btnAdd.style.background = ''; btnAdd.disabled = false; }, 2000);
    } catch (error) { 
        alert("Error al guardar."); 
        btnAdd.innerHTML = originalText; btnAdd.disabled = false; 
    }
});


function descargarTodaLaData() {
    if(!currentUser || !db) return;
    const q = query(collection(db, "transactions"), where("uid", "==", currentUser.uid), orderBy("date", "desc"));
    
    onSnapshot(q, (snapshot) => {
        allTransactions = [];
        snapshot.forEach((doc) => { allTransactions.push({ id: doc.id, ...doc.data() }); });
        procesarYRenderizarDashboard(); 
    });
}

function procesarYRenderizarDashboard() {
    if(!monthFilter || !monthFilter.value) return;
    const [selYear, selMonth] = monthFilter.value.split('-'); 
    
    let saldoTotal = 0; let ahorrosTotales = 0; 
    let ingresosMes = 0; let gastosMes = 0; let ahorrosDelMes = 0;
    
    // Añadida la categoría Salidas_Ocio
    let chartDataMap = { "Comida": 0, "Salidas_Ocio": 0, "Salud": 0, "Educacion": 0, "Transporte": 0, "Servicios": 0, "Otros": 0 };
    
    const historyList = document.getElementById('transaction-list');
    if(historyList) historyList.innerHTML = ''; 

    allTransactions.forEach(data => {
        const amount = data.amount || 0;
        
        if (data.type === 'income') saldoTotal += amount;
        if (data.type === 'expense') saldoTotal -= amount;
        if (data.type === 'saving') { 
            ahorrosTotales += amount; 
            if (data.category !== 'Ahorro_Inicial') saldoTotal -= amount; 
        }

        let isSelectedMonth = false;
        let txDateObj = new Date(); 
        
        if (data.date) {
            txDateObj = data.date.toDate();
            const txMonth = String(txDateObj.getMonth() + 1).padStart(2, '0');
            const txYear = String(txDateObj.getFullYear());
            isSelectedMonth = (txYear === selYear && txMonth === selMonth);
        } else {
            const now = new Date();
            isSelectedMonth = (String(now.getFullYear()) === selYear && String(now.getMonth() + 1).padStart(2, '0') === selMonth);
        }

        if (isSelectedMonth) {
            if (data.type === 'income') ingresosMes += amount;
            if (data.type === 'expense') {
                gastosMes += amount;
                if (chartDataMap[data.category] !== undefined) chartDataMap[data.category] += amount;
            }
            if (data.type === 'saving' && data.category !== 'Ahorro_Inicial') {
                ahorrosDelMes += amount; 
            }

            if(historyList) {
                const li = document.createElement('div');
                li.className = `history-item ${data.type}`;
                let icon = 'fa-money-bill'; let prefix = '-';
                if(data.type === 'income') { icon = 'fa-arrow-trend-up'; prefix = '+'; }
                if(data.type === 'saving') { icon = 'fa-piggy-bank'; prefix = ''; }
                
                // Limpiar el texto para que se vea bonito en el historial
                let categoryName = (data.category || "").replace("_", " ").replace("Ocio", "/ Ocio");
                
                const day = String(txDateObj.getDate()).padStart(2, '0');
                const monthStr = String(txDateObj.getMonth() + 1).padStart(2, '0');
                const year = txDateObj.getFullYear();
                const hora = txDateObj.toLocaleTimeString('es-ES', {hour: '2-digit', minute:'2-digit'});

                li.innerHTML = `
                    <div class="history-info">
                        <strong><i class="fa-solid ${icon}"></i> ${categoryName}</strong>
                        <small>${day}/${monthStr}/${year} - ${hora}</small>
                    </div>
                    <div class="history-amount ${data.type}">
                        ${prefix} S/ ${amount.toFixed(2)}
                    </div>
                `;
                historyList.appendChild(li);
            }
        }
    });

    globalAhorroTotal = ahorrosTotales;

    if(historyList && historyList.innerHTML === '') {
        historyList.innerHTML = '<p style="text-align:center; color:#a4b0be; padding: 20px;">No hay movimientos registrados en este mes.</p>';
    }

    let metaAhorroIdeal = ingresosMes * 0.20; 
    let ahorroAConsiderar = Math.max(metaAhorroIdeal, ahorrosDelMes); 
    let presupuestoSeguroMes = ingresosMes - gastosMes - ahorroAConsiderar;

    animarContador('display-balance', saldoTotal);
    animarContador('display-savings', ahorrosTotales);
    animarContador('display-income', ingresosMes);
    animarContador('display-expenses', gastosMes);
    animarContador('display-budget', presupuestoSeguroMes); 

    actualizarGrafica(chartDataMap);
}

function animarContador(elementId, targetValue) {
    const element = document.getElementById(elementId);
    if (element) {
        if(targetValue < 0) {
            element.innerText = `- S/ ${Math.abs(targetValue).toFixed(2)}`;
            element.style.color = '#ff4757'; 
        } else {
            element.innerText = `S/ ${targetValue.toFixed(2)}`;
            element.style.color = ''; 
        }
    }
}

function actualizarGrafica(dataMap) {
    const ctx = document.getElementById('expensesChart')?.getContext('2d');
    if(!ctx) return;
    if (expensesChart) expensesChart.destroy();
    Chart.defaults.color = '#ffffff'; Chart.defaults.font.family = "'Poppins', sans-serif";
    
    // Le agregué un color más a la paleta para la nueva categoría
    expensesChart = new Chart(ctx, {
        type: 'doughnut',
        data: {
            labels: Object.keys(dataMap),
            datasets: [{
                data: Object.values(dataMap),
                backgroundColor: ['#feca57', '#ff6b81', '#ff4757', '#0fbcf9', '#ff9ff3', '#54a0ff', '#8395a7'],
                borderColor: '#1e272e', borderWidth: 2, hoverOffset: 15
            }]
        },
        options: {
            responsive: true, maintainAspectRatio: false, cutout: '75%',
            plugins: { legend: { position: 'right', labels: { padding: 15, boxWidth: 12, usePointStyle: true, font: {size: 11} } } }
        }
    });
}
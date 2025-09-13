const products = [
  { id: 'p1', name: 'Classic Coffee (12oz)', price: 120.00, img: 'https://picsum.photos/seed/coffee1/800/500' },
  { id: 'p2', name: 'Hazelnut Latte', price: 150.00, img: 'https://picsum.photos/seed/coffee2/800/500' },
  { id: 'p3', name: 'Blueberry Muffin', price: 80.00, img: 'https://picsum.photos/seed/muffin/800/500' },
  { id: 'p4', name: 'Cold Brew (16oz)', price: 140.00, img: 'https://picsum.photos/seed/coldbrew/800/500' }
];

const state = { cart: [] };

function $(sel){return document.querySelector(sel)}

function renderProducts(){
  const el = $('#products');
  el.innerHTML = '';
  for(const p of products){
    const card = document.createElement('div');card.className='card';
    card.innerHTML = `
      <img src="${p.img}" alt="${p.name}" />
      <h4>${p.name}</h4>
      <div class="meta"><div>₱ ${p.price.toFixed(2)}</div><button data-id="${p.id}">Add</button></div>
    `;
    el.appendChild(card);
  }
}

function findInCart(id){return state.cart.find(c=>c.id===id)}

function addToCart(id){
  const prod = products.find(p=>p.id===id);
  if(!prod) return;
  const existing = findInCart(id);
  if(existing) existing.qty++;
  else state.cart.push({ id:prod.id, name:prod.name, price:prod.price, qty:1 });
  renderCart();
}

function removeFromCart(id){
  state.cart = state.cart.filter(c=>c.id!==id);
  renderCart();
}

function changeQty(id, delta){
  const item = findInCart(id);
  if(!item) return;
  item.qty += delta;
  if(item.qty <= 0) removeFromCart(id);
  renderCart();
}

function calculate(){
  let subtotal=0;
  for(const it of state.cart) subtotal += it.price * it.qty;
  const tax = Math.round(subtotal * 0.12 * 100)/100;
  const total = Math.round((subtotal + tax)*100)/100;
  return { subtotal, tax, total };
}

function renderCart(){
  const el = $('#cartList');
  el.innerHTML = '';
  for(const it of state.cart){
    const line = document.createElement('div');line.className='line';
    line.innerHTML = `
      <div>
        <strong>${it.name}</strong><br/><small>₱ ${it.price.toFixed(2)} x ${it.qty}</small>
      </div>
      <div style="text-align:right">
        <div>₱ ${(it.price*it.qty).toFixed(2)}</div>
        <div style="margin-top:6px">
          <button data-action="dec" data-id="${it.id}">-</button>
          <button data-action="inc" data-id="${it.id}">+</button>
          <button data-action="rm" data-id="${it.id}">Remove</button>
        </div>
      </div>
    `;
    el.appendChild(line);
  }
  const { subtotal, tax, total } = calculate();
  $('#subtotal').innerText = subtotal.toFixed(2);
  $('#tax').innerText = tax.toFixed(2);
  $('#total').innerText = total.toFixed(2);
  $('#cartSummary').innerText = `${state.cart.length} item(s) • ₱ ${total.toFixed(2)}`;
}

// Event delegation for product add
document.addEventListener('click', (e) => {
  const btn = e.target.closest('button');
  if(!btn) return;
  if(btn.dataset.id){
    addToCart(btn.dataset.id);
  }
  if(btn.dataset.action){
    const id = btn.dataset.id;
    if(btn.dataset.action === 'dec') changeQty(id, -1);
    if(btn.dataset.action === 'inc') changeQty(id, +1);
    if(btn.dataset.action === 'rm') removeFromCart(id);
  }
});

// Place order
$('#orderForm').addEventListener('submit', async (ev) => {
  ev.preventDefault();
  const name = $('#name').value.trim();
  const email = $('#email').value.trim();
  const phone = $('#phone').value.trim();
  if(!name) { showMessage('Please enter name', true); return; }
  if(state.cart.length === 0) { showMessage('Cart empty', true); return; }

  const payload = { name, email, phone, items: state.cart };
  try{
    const resp = await fetch('/api/preorder', {
      method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify(payload)
    });
    const data = await resp.json();
    if(data && data.success){
      showMessage(`Pre-order placed! Order ID: ${data.order.id}`);
      // clear cart
      state.cart = [];
      renderCart();
      // auto-save local copy to browser (IndexedDB/localStorage simple)
      const saved = JSON.parse(localStorage.getItem('orders')||'[]');
      saved.push({ id: data.order.id, name, email, phone, items: data.order.items, total: data.order.total, ts: new Date().toISOString() });
      localStorage.setItem('orders', JSON.stringify(saved));
    } else {
      showMessage('Server error placing order', true);
    }
  }catch(err){
    console.error(err); showMessage('Network error', true);
  }
});

function showMessage(msg, isError){
  const el = $('#message'); el.innerText = msg; el.style.color = isError? 'crimson' : 'green';
  setTimeout(()=> el.innerText = '', 6000);
}

// Initialize
renderProducts(); renderCart();

// Socket for realtime updates
const socket = io();
socket.on('connect', ()=> console.log('socket connected'));
socket.on('new-order', (order)=>{
  // small visual toast
  showMessage(`New order received: ${order.id}`);
});

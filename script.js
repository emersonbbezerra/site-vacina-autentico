let postosVacina = [];
let mapa, usuarioMarker;
let marcadores = [];
let usuarioPosicao = { lat: -7.2291, lng: -35.8808 }; // fallback
let infoWindowAberto = null;

function inicializarMapa() {
  if (navigator.geolocation) {
    navigator.geolocation.getCurrentPosition(
      (pos) => {
        usuarioPosicao = {
          lat: pos.coords.latitude,
          lng: pos.coords.longitude,
        };
        console.log("Posição real do usuário:", usuarioPosicao);
        carregarMapa();
      },
      (erro) => {
        console.warn('Erro ao obter localização:', erro.message);
        alert('Não foi possível obter sua localização real. Usando localização padrão.');
        carregarMapa();
      }
    );
  } else {
    alert('Geolocalização não suportada pelo navegador.');
    carregarMapa();
  }
}

function carregarMapa() {
  if (!mapa) {
    mapa = new google.maps.Map(document.getElementById("mapa"), {
      center: usuarioPosicao,
      zoom: 13,
    });
  } else {
    mapa.setCenter(usuarioPosicao);
    mapa.panTo(usuarioPosicao);
  }

  if (usuarioMarker) {
    usuarioMarker.setPosition(usuarioPosicao);
  } else {
    usuarioMarker = new google.maps.Marker({
      position: usuarioPosicao,
      map: mapa,
      icon: "https://maps.google.com/mapfiles/ms/icons/blue-dot.png",
      title: "Sua localização",
    });
  }

  carregarLocais();
}

function carregarLocais() {
  fetch('locais_geocoded.json')
    .then((response) => response.json())
    .then((data) => {
      postosVacina = data;
      verTodos(); // opcional: mostrar todos os postos no mapa inicialmente
    })
    .catch((error) => {
      console.error('Erro ao carregar os locais:', error);
    });
}

function normalizarVacina(nome) {
  return nome
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .trim()
    .toLowerCase()
    .replace(/\s+/g, "_");
}

function buscarVacina() {
  const inputBusca = document.getElementById("search");
  const termo = normalizarVacina(inputBusca.value);
  const resultado = document.getElementById("resultado");
  const mensagemErro = document.getElementById("mensagemErro");
  resultado.innerHTML = "";
  mensagemErro.innerHTML = "";
  limparMarcadores();

  if (!termo) {
    mensagemErro.innerHTML = "<p>Digite o nome de uma vacina.</p>";
    inputBusca.value = "";
    return;
  }

  const postosComVacina = postosVacina
  .filter(posto => {
    if (!posto.vacinas) return false;
    // Busca vacina compatível
    const nomeCorrespondente = Object.keys(posto.vacinas).find(vacina =>
      vacina.startsWith(termo) || vacina.includes(termo)
    );
    return nomeCorrespondente && posto.vacinas[nomeCorrespondente] > 0;
  })
  .map(posto => {
    // Localiza novamente a vacina correspondente para exibir
    const vacinaCorrespondente = Object.keys(posto.vacinas).find(vacina =>
      vacina.startsWith(termo) || vacina.includes(termo)
    );
    return {
      ...posto,
      vacinaEncontrada: vacinaCorrespondente,
      quantidade: posto.vacinas[vacinaCorrespondente],
      distancia: calcularDistancia(usuarioPosicao, posto.coords),
    };
  })  
  .sort((a, b) => a.distancia - b.distancia);

  if (postosComVacina.length === 0) {
    mensagemErro.innerHTML = `<p>Nenhum posto encontrado para a vacina "${termo.replace(/_/g, " ")}".</p>`;
    inputBusca.value = "";
    return;
  }

  const lista = document.createElement("div");
  postosComVacina.forEach(posto => {
    const item = document.createElement("div");
    item.className = "posto";
    item.innerHTML = `
      <strong>${posto.posto}</strong><br/>
      <strong>Endereço:</strong> ${posto.endereco}<br/>
      <strong>Vacina:</strong> ${posto.vacinaEncontrada.replace(/_/g, " ").toUpperCase()}<br/>
      <strong>Quantidade disponível:</strong> ${posto.quantidade}<br/>
      <strong>Distância:</strong> ${posto.distancia.toFixed(2)} km
    `;

    // Adicionar evento de clique para centralizar o mapa no local e mostrar só esse marcador
    item.addEventListener("click", () => {
      limparMarcadores();
      const marcador = new google.maps.Marker({
        position: posto.coords,
        map: mapa,
        title: posto.posto,
      });

      const infowindow = new google.maps.InfoWindow({
        content: `
          <strong>${posto.posto}</strong><br/>
          ${posto.endereco}<br/>
          <strong>Vacina:</strong> ${posto.vacinaEncontrada.replace(/_/g, " ").toUpperCase()}<br/>
          <strong>Quantidade disponível:</strong> ${posto.quantidade}
        `,
      });

      marcador.addListener("click", () => {
        if (infoWindowAberto) {
          infoWindowAberto.close();
        }
        infowindow.open(mapa, marcador);
        infoWindowAberto = infowindow;
      });

      marcadores.push(marcador);

      mapa.panTo(posto.coords);
      mapa.setZoom(15);

      // Scroll para a div do mapa para centralizá-la na viewport
      const mapaDiv = document.getElementById("mapa");
      if (mapaDiv) {
        mapaDiv.scrollIntoView({ behavior: "smooth", block: "center" });
      }
    });

    lista.appendChild(item);
  });
  resultado.appendChild(lista);
  inputBusca.value = "";

  const maisProximos = postosComVacina.slice(0, 5);
  limparMarcadores();
  maisProximos.forEach(posto => {
    const marcador = new google.maps.Marker({
      position: posto.coords,
      map: mapa,
      title: posto.posto,
    });

    const infowindow = new google.maps.InfoWindow({
      content: `
        <strong>${posto.posto}</strong><br/>
        ${posto.endereco}<br/>
        <strong>Vacina:</strong> ${posto.vacinaEncontrada.replace(/_/g, " ").toUpperCase()}<br/>
        <strong>Quantidade disponível:</strong> ${posto.quantidade}
      `,
    });    

    marcador.addListener("click", () => {
      if (infoWindowAberto) {
        infoWindowAberto.close();
      }
      infowindow.open(mapa, marcador);
      infoWindowAberto = infowindow;
    });

    marcadores.push(marcador);
  });

  // Centralizar o mapa na média das coordenadas dos resultados
  if (maisProximos.length > 0) {
    let latSum = 0;
    let lngSum = 0;
    maisProximos.forEach(posto => {
      latSum += posto.coords.lat;
      lngSum += posto.coords.lng;
    });
    const centro = {
      lat: latSum / maisProximos.length,
      lng: lngSum / maisProximos.length
    };
    mapa.setCenter(centro);
    mapa.setZoom(13);
  } else {
    // Se não houver resultados, centraliza na posição do usuário
    mapa.setCenter(usuarioPosicao);
    mapa.setZoom(13);
  }

  // Scroll para a div do mapa para centralizá-la na viewport
  const mapaDiv = document.getElementById("mapa");
  if (mapaDiv) {
    mapaDiv.scrollIntoView({ behavior: "smooth", block: "center" });
  }
}

function verTodos() {
  limparMarcadores();

  postosVacina.forEach((posto) => {
    const marcador = new google.maps.Marker({
      position: posto.coords,
      map: mapa,
      title: posto.posto,
    });

    const infowindow = new google.maps.InfoWindow({
      content: `<strong>${posto.posto}</strong><br/>${posto.endereco}`,
    });

    marcador.addListener("click", () => {
      if (infoWindowAberto) {
        infoWindowAberto.close();
      }
      infowindow.open(mapa, marcador);
      infoWindowAberto = infowindow;
    });

    marcadores.push(marcador);
  });

  mapa.setCenter(usuarioPosicao);
  mapa.setZoom(13);
}

function calcularDistancia(pos1, pos2) {
  const R = 6371;
  const dLat = (pos2.lat - pos1.lat) * Math.PI / 180;
  const dLon = (pos2.lng - pos1.lng) * Math.PI / 180;
  const a =
    0.5 - Math.cos(dLat) / 2 +
    Math.cos(pos1.lat * Math.PI / 180) * Math.cos(pos2.lat * Math.PI / 180) *
    (1 - Math.cos(dLon)) / 2;
  return R * 2 * Math.asin(Math.sqrt(a));
}

function limparMarcadores() {
  marcadores.forEach(m => m.setMap(null));
  marcadores = [];
}

document.getElementById("search").addEventListener("keydown", function (event) {
  if (event.key === "Enter") {
    buscarVacina();
  }
});

window.inicializarMapa = inicializarMapa;

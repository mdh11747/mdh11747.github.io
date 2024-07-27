document.addEventListener("DOMContentLoaded", function () {
    document.getElementById("contact").addEventListener("submit", function (event) {
        event.preventDefault(); // Prevent default form submission

        const formData = new FormData(this);
        fetch(this.action, {
            method: "POST",
            body: formData
        })
            .then(response => response.text())
            .then(data => {
                document.getElementById("form-container").style.display = "none";
                document.getElementById("result-container").style.display = "flex";
                const success = document.getElementsByClassName("success");
                success[0].style.display = "block";
                success[1].style.display = "block";
            })
            .catch(error => {
                document.getElementById("form-container").style.display = "none";
                document.getElementById("result-container").style.display = "flex";
                const failure = document.getElementsByClassName("failure");
                failure[0].style.display = "block";
                failure[1].style.display = "block";
            });
});
});
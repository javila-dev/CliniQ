from rest_framework.pagination import PageNumberPagination


class PaginacionEstandar(PageNumberPagination):
    """Paginación por defecto: 25 filas, el cliente puede pedir más con ?page_size.

    Sin `page_size_query_param` DRF ignora el `page_size` que manda el frontend
    y corta todas las listas en 25 (selectores, agenda, paginadores).
    """

    page_size = 25
    page_size_query_param = "page_size"
    max_page_size = 500


class PaginacionAgenda(PaginacionEstandar):
    # La vista Mes trae todas las citas del mes en una sola petición.
    max_page_size = 2000
